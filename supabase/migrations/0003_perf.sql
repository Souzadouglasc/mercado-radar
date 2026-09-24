-- MercadoRadar - Fase 6 (Tarefa F): performance de leitura do catálogo.
-- 1 round-trip por página via RPC latest_prices_for_products(product_ids) + view latest_prices.
-- Busca full-text pt-BR com fallback ilike (comportamento atual preservado).
-- RLS intacto: leitura pública (catálogo), sem alterar policies existentes.

create extension if not exists "pg_trgm";

-- Índices (idempotentes)
create index if not exists prices_product_collected_cover_idx
  on prices (product_id, collected_at desc)
  include (market_id, price, promotional_price);
create index if not exists prices_market_collected_idx2
  on prices (market_id, collected_at desc);
create index if not exists products_name_trgm_idx
  on products using gin (name gin_trgm_ops);
create index if not exists products_brand_trgm_idx
  on products using gin (brand gin_trgm_ops);
-- Full-text pt-BR (nome + marca)
create index if not exists products_search_tsv_idx on products using gin (
  to_tsvector('portuguese', coalesce(name, '') || ' ' || coalesce(brand, ''))
);

-- View: último preço por (produto, mercado)
create or replace view latest_prices as
select distinct on (p.product_id, p.market_id)
  p.product_id,
  p.market_id,
  p.price,
  p.promotional_price,
  p.collected_at,
  m.name as market_name,
  m.slug as market_slug
from prices p
join markets m on m.id = p.market_id
order by p.product_id, p.market_id, p.collected_at desc;

-- RPC: 1 round-trip para N produtos (elimina N+1 de latestPrices/searchProducts)
create or replace function latest_prices_for_products(p_ids uuid[])
returns table (
  product_id uuid,
  market_id uuid,
  price numeric,
  promotional_price numeric,
  collected_at timestamptz,
  market_name text,
  market_slug text
)
language sql stable security definer set search_path = public as $$
  select distinct on (p.product_id, p.market_id)
    p.product_id, p.market_id, p.price, p.promotional_price, p.collected_at,
    m.name, m.slug
  from prices p
  join markets m on m.id = p.market_id
  where p.product_id = any (p_ids)
  order by p.product_id, p.market_id, p.collected_at desc;
$$;

-- RPC: busca full-text pt-BR com fallback ilike (mesmo contrato do ilike atual)
create or replace function search_products_ft(p_term text, p_limit int default 20)
returns table (
  id uuid, name text, slug text, brand text,
  unit text, quantity numeric, image_url text, rank real
)
language sql stable security definer set search_path = public as $$
  with q as (select plainto_tsquery('portuguese', p_term) as tsq)
  (
    select p.id, p.name, p.slug, p.brand, p.unit, p.quantity, p.image_url,
      ts_rank(to_tsvector('portuguese', coalesce(p.name,'') || ' ' || coalesce(p.brand,'')), q.tsq) as rank
    from products p, q
    where p.active
      and to_tsvector('portuguese', coalesce(p.name,'') || ' ' || coalesce(p.brand,'')) @@ q.tsq
    order by rank desc, p.name
    limit p_limit
  )
  union
  (
    select p.id, p.name, p.slug, p.brand, p.unit, p.quantity, p.image_url, 0::real
    from products p
    where p.active
      and (p.name ilike '%' || p_term || '%' or coalesce(p.brand,'') ilike '%' || p_term || '%')
      and not exists (
        select 1 from products p2, q
        where p2.id = p.id and p2.active
          and to_tsvector('portuguese', coalesce(p2.name,'') || ' ' || coalesce(p2.brand,'')) @@ q.tsq
      )
    order by p.name
    limit p_limit
  )
  limit p_limit;
$$;

grant select on latest_prices to anon, authenticated;
grant execute on function latest_prices_for_products(uuid[]) to anon, authenticated;
grant execute on function search_products_ft(text, int) to anon, authenticated;
