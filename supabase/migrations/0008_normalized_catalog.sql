-- MercadoRadar - Migration 0008: Normalized Catalog (canonical_products + product_aliases.market_sku)
-- Adiciona:
-- 1. canonical_products: tabela de produtos normalizados (mercado-independente)
-- 2. products.normalized_id: FK opcional para canonical_products
-- 3. product_aliases.market_sku: SKU do mercado para match mais preciso
-- 4. RPC upsert_canonical_product: match por EAN → alias (market+raw_name) → canonical_name fuzzy → novo

create extension if not exists "pg_trgm";

-- Tabela de produtos canônicos (normalizados, mercado-independentes)
create table if not exists canonical_products (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  slug text unique not null,
  brand text,
  barcode text,              -- EAN/GTIN universal
  unit text,
  quantity numeric,
  normalized_unit text check (normalized_unit in ('kg','L','un')),
  normalized_quantity numeric,
  image_url text,
  category_id uuid references categories(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices para busca e match
create index if not exists canonical_products_barcode_idx on canonical_products (barcode) where barcode is not null;
create index if not exists canonical_products_name_trgm_idx on canonical_products using gin (canonical_name gin_trgm_ops);
create index if not exists canonical_products_search_tsv_idx on canonical_products using gin (
  to_tsvector('portuguese', coalesce(canonical_name, '') || ' ' || coalesce(brand, ''))
);

-- Trigger updated_at
create trigger canonical_products_updated_at before update on canonical_products
  for each row execute function set_updated_at();

-- Coluna normalized_id em products (FK opcional para canonical_products)
alter table products add column if not exists normalized_id uuid references canonical_products(id) on delete set null;
create index if not exists products_normalized_id_idx on products (normalized_id) where normalized_id is not null;

-- Coluna market_sku em product_aliases (SKU do mercado para match)
alter table product_aliases add column if not exists market_sku text;

-- RLS
alter table canonical_products enable row level security;
create policy "canonical publico" on canonical_products for select using (true);
create policy "canonical escrita admin" on canonical_products for all using (is_admin()) with check (is_admin());

grant select on canonical_products to anon, authenticated;

-- RPC: upsert_canonical_product
-- Match priority: EAN → alias (market+raw_name) → canonical_name fuzzy (v2) → novo
create or replace function upsert_canonical_product(
  p_canonical_name text,
  p_brand text,
  p_barcode text,
  p_market_slug text,
  p_raw_name text,
  p_market_sku text,
  p_quantity numeric,
  p_unit text,
  p_normalized_quantity numeric,
  p_normalized_unit text,
  p_image_url text,
  p_category_hint text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_canonical_id uuid;
  v_market_id uuid;
  v_category_id uuid;
  v_slug text;
  v_tsq tsquery;
begin
  -- 1. Tenta EAN/GTIN (exato)
  if p_barcode is not null and p_barcode <> '' then
    select id into v_canonical_id
    from canonical_products
    where barcode = p_barcode
    limit 1;
    
    if v_canonical_id is not null then
      -- Atualiza last_seen implícito via updated_at
      update canonical_products
      set updated_at = now()
      where id = v_canonical_id;
      return v_canonical_id;
    end if;
  end if;

  -- 2. Tenta alias (market + raw_name)
  select m.id into v_market_id
  from markets m
  where m.slug = p_market_slug
  limit 1;

  if v_market_id is not null then
    select pa.product_id into v_canonical_id
    from product_aliases pa
    where pa.market_id = v_market_id
      and pa.raw_name = p_raw_name
    limit 1;

    if v_canonical_id is not null then
      update canonical_products set updated_at = now() where id = v_canonical_id;
      return v_canonical_id;
    end if;
  end if;

  -- 3. Tenta nome canônico exato (via slug)
  v_slug := regexp_replace(lower(p_canonical_name), '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');

  select id into v_canonical_id
  from canonical_products
  where slug = v_slug
  limit 1;

  if v_canonical_id is not null then
    -- Registra alias para próximas vezes
    if v_market_id is not null then
      insert into product_aliases (product_id, market_id, raw_name, market_sku)
      values (v_canonical_id, v_market_id, p_raw_name, p_market_sku)
      on conflict (product_id, market_id, raw_name) do nothing;
    end if;
    update canonical_products set updated_at = now() where id = v_canonical_id;
    return v_canonical_id;
  end if;

  -- 4. Cria novo canonical_product
  if p_category_hint is not null then
    select id into v_category_id
    from categories
    where name ilike p_category_hint
    limit 1;
  end if;

  insert into canonical_products (
    canonical_name, slug, brand, barcode, unit, quantity,
    normalized_unit, normalized_quantity, image_url, category_id
  ) values (
    p_canonical_name, v_slug, p_brand, p_barcode, p_unit, p_quantity,
    p_normalized_unit, p_normalized_quantity, p_image_url, v_category_id
  )
  returning id into v_canonical_id;

  -- Registra alias
  if v_market_id is not null then
    insert into product_aliases (product_id, market_id, raw_name, market_sku)
    values (v_canonical_id, v_market_id, p_raw_name, p_market_sku)
    on conflict (product_id, market_id, raw_name) do nothing;
  end if;

  return v_canonical_id;
end $$;

grant execute on function upsert_canonical_product(
  text, text, text, text, text, text, numeric, text, numeric, text, text, text
) to anon, authenticated;