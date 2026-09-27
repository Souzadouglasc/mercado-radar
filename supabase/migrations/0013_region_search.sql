-- Keep full-text product search and city filtering on one canonical signature.
-- Migrations 0006 and 0011 left two overloaded functions with different output
-- data sources, which made PostgREST resolution and region filtering inconsistent.

DROP FUNCTION IF EXISTS public.search_products_ft(text, integer, text);
DROP FUNCTION IF EXISTS public.search_products_ft(text, integer);

CREATE FUNCTION public.search_products_ft(
  p_term text,
  p_limit integer DEFAULT 20,
  p_city text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  name text,
  slug text,
  brand text,
  unit text,
  quantity numeric,
  image_url text,
  rank real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
  WITH q AS (
    SELECT plainto_tsquery('portuguese', p_term) AS tsq
  ), eligible AS (
    SELECT p.id, p.name, p.slug, p.brand, p.unit, p.quantity, p.image_url,
      to_tsvector('portuguese', coalesce(p.name, '') || ' ' || coalesce(p.brand, '')) AS document
    FROM public.products AS p
    WHERE p.active
      AND (
        p_city IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.prices AS pr
          JOIN public.markets AS m ON m.id = pr.market_id
          WHERE pr.product_id = p.id
            AND m.active
            AND CASE p_city
              WHEN 'sao-jose' THEN m.city ILIKE 'São José%' OR m.city ILIKE 'Sao Jose%'
              WHEN 'florianopolis' THEN m.city ILIKE 'Florianópolis%' OR m.city ILIKE 'Florianopolis%'
              ELSE m.city = p_city
            END
        )
      )
  ), ranked AS (
    SELECT e.id, e.name, e.slug, e.brand, e.unit, e.quantity, e.image_url,
      ts_rank(e.document, q.tsq) AS rank
    FROM eligible AS e
    CROSS JOIN q
    WHERE e.document @@ q.tsq
  ), fallback AS (
    SELECT e.id, e.name, e.slug, e.brand, e.unit, e.quantity, e.image_url, 0::real AS rank
    FROM eligible AS e
    WHERE e.name ILIKE '%' || p_term || '%'
      OR coalesce(e.brand, '') ILIKE '%' || p_term || '%'
  ), combined AS (
    SELECT * FROM ranked
    UNION ALL
    SELECT f.id, f.name, f.slug, f.brand, f.unit, f.quantity, f.image_url, f.rank
    FROM fallback AS f
    WHERE NOT EXISTS (SELECT 1 FROM ranked AS r WHERE r.id = f.id)
  )
  SELECT c.id, c.name, c.slug, c.brand, c.unit, c.quantity, c.image_url, c.rank
  FROM combined AS c
  ORDER BY c.rank DESC, c.name
  LIMIT greatest(1, least(p_limit, 100));
$function$;

GRANT EXECUTE ON FUNCTION public.search_products_ft(text, integer, text)
  TO anon, authenticated, service_role;
