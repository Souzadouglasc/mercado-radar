-- Safely match equivalent catalog names when retailers format product titles differently.
-- Brand and package size must match, important variant words must agree, and the
-- best candidate must be clearly better than the runner-up.

create index if not exists canonical_products_identity_lookup_idx
  on public.canonical_products (lower(btrim(brand)), normalized_unit, normalized_quantity)
  where active and brand is not null and normalized_quantity is not null;

create or replace function public.match_canonical_product(
  p_canonical_name text,
  p_brand text,
  p_normalized_quantity numeric,
  p_normalized_unit text
)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  with normalized_names as (
    select
      cp.id,
      cp.brand,
      cp.normalized_quantity,
      cp.normalized_unit,
      translate(lower(cp.canonical_name), 'áàâãéêíóôõúç', 'aaaaeeiooouc') as canonical_name,
      translate(lower(p_canonical_name), 'áàâãéêíóôõúç', 'aaaaeeiooouc') as input_name
    from public.canonical_products as cp
    where cp.active and cp.canonical_name is not null
  ), candidates as (
    select
      names.id,
      extensions.similarity(names.canonical_name, names.input_name) as score
    from normalized_names as names
    where names.canonical_name is not null
      and nullif(btrim(p_canonical_name), '') is not null
      and nullif(btrim(p_brand), '') is not null
      and p_normalized_quantity > 0
      and p_normalized_unit in ('kg', 'L', 'un')
      and names.normalized_quantity = p_normalized_quantity
      and names.normalized_unit = p_normalized_unit
      and lower(btrim(names.brand)) = lower(btrim(p_brand))
      and extensions.similarity(names.canonical_name, names.input_name) >= 0.84
      and not exists (
        select 1
        from unnest(array[
          'zero', 'light', 'diet', 'integral', 'desnatado', 'semidesnatado',
          'semi-desnatado', 'lactose', 'sem acucar', 'com acucar', 'original',
          'tradicional', 'alcool', 'alcohol', 'lata', 'long neck', 'garrafa',
          'pet', 'tetra pak', 'morango', 'chocolate', 'baunilha', 'uva',
          'limao', 'laranja', 'guarana', 'manga', 'abacaxi', 'maca',
          'com gas', 'sem gas'
        ]::text[]) as marker(value)
        where (position(marker.value in names.canonical_name) > 0)
          is distinct from (position(marker.value in names.input_name) > 0)
      )
  ), ranked as (
    select
      id,
      score,
      lead(score) over (order by score desc, id) as next_score
    from candidates
  )
  select id
  from ranked
  where score >= 0.84
    and (next_score is null or score - next_score >= 0.08)
  order by score desc, id
  limit 1;
$$;

revoke execute on function public.match_canonical_product(text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.match_canonical_product(text, text, numeric, text) to service_role;

