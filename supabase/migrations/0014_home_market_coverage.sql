-- Return canonical products that have fresh prices in multiple active markets.
-- This lets the home page show useful comparisons without loading the full catalog.

create index if not exists prices_product_market_collected_idx
  on public.prices (product_id, market_id, collected_at desc)
  include (price, promotional_price);

create or replace function public.top_canonical_products_by_market_coverage(
  p_limit integer default 6
)
returns table (canonical_id uuid, market_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with latest as (
    select distinct on (pr.normalized_id, p.market_id)
      pr.normalized_id as canonical_id,
      p.market_id
    from public.prices as p
    join public.products as pr on pr.id = p.product_id and pr.active
    join public.markets as m on m.id = p.market_id and m.active
    where pr.normalized_id is not null
      and p.collected_at >= now() - interval '14 days'
    order by pr.normalized_id, p.market_id, p.collected_at desc
  ), coverage as (
    select canonical_id, count(*)::integer as market_count
    from latest
    group by canonical_id
  )
  select cp.id, coverage.market_count
  from coverage
  join public.canonical_products as cp on cp.id = coverage.canonical_id
  where cp.active and coverage.market_count > 1
  order by coverage.market_count desc, cp.updated_at desc, cp.canonical_name
  limit greatest(1, least(coalesce(p_limit, 6), 20));
$$;

revoke execute on function public.top_canonical_products_by_market_coverage(integer) from public;
grant execute on function public.top_canonical_products_by_market_coverage(integer) to anon, authenticated;
