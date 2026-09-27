-- MercadoRadar: novos catálogos VTEX da Grande Florianópolis.
-- Bistek usa a loja Florianópolis - Ilha; Angeloni expõe preços da unidade Beira-Mar.

insert into price_sources (id, name)
values (5, 'catalog-api')
on conflict (id) do nothing;

insert into markets (name, slug, website_url, city, active)
values
  ('Bistek - Florianópolis (Ilha)', 'bistek', 'https://www.bistek.com.br', 'Florianópolis', true),
  ('Angeloni - Beira-Mar', 'angeloni', 'https://super.angeloni.com.br', 'Florianópolis', true)
on conflict (slug) do update
set name = excluded.name,
    website_url = excluded.website_url,
    city = excluded.city,
    active = true,
    updated_at = now();

update markets
set city = 'São José', updated_at = now()
where slug in ('brasil', 'komprao') and city is null;

insert into scrape_actions (market_slug, action_type, status, priority, params)
select m.slug, 'incremental', 'pending', 20,
       jsonb_build_object('limit', 1000, 'concurrency', 4, 'throttleMs', 2000, 'skip', 0)
from markets m
where m.slug in ('bistek', 'angeloni')
  and not exists (
    select 1 from scrape_actions a
    where a.market_slug = m.slug and a.status in ('pending', 'running')
  );

