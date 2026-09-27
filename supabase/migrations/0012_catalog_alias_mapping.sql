-- Normalize product_aliases IDs after the canonical catalog migration.
-- product_id is the market-specific products.id; canonical_id is the shared catalog ID.

ALTER TABLE public.product_aliases
  ADD COLUMN IF NOT EXISTS canonical_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.product_aliases'::regclass
      AND conname = 'product_aliases_canonical_id_fkey'
  ) THEN
    ALTER TABLE public.product_aliases
      ADD CONSTRAINT product_aliases_canonical_id_fkey
      FOREIGN KEY (canonical_id)
      REFERENCES public.canonical_products(id)
      ON DELETE CASCADE;
  END IF;
END;
$$;

-- Older scraper code stored canonical_products.id in product_id. Resolve those
-- rows back to products.id and preserve the canonical reference in canonical_id.
WITH mappings AS (
  SELECT alias.id AS alias_id,
         market_product.id AS market_product_id,
         canonical_product.id AS canonical_product_id
  FROM public.product_aliases AS alias
  JOIN public.canonical_products AS canonical_product
    ON canonical_product.id = alias.product_id
  JOIN public.products AS market_product
    ON market_product.normalized_id = canonical_product.id
   AND market_product.market_id = alias.market_id
  WHERE alias.canonical_id IS NULL
)
UPDATE public.product_aliases AS alias
SET product_id = mappings.market_product_id,
    canonical_id = mappings.canonical_product_id
FROM mappings
WHERE alias.id = mappings.alias_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.product_aliases alias
    LEFT JOIN public.products market_product ON market_product.id = alias.product_id
    WHERE market_product.id IS NULL
  ) THEN
    RAISE EXCEPTION 'product_aliases.product_id still contains non-market product IDs';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.product_aliases'::regclass
      AND conname = 'product_aliases_product_id_fkey'
  ) THEN
    ALTER TABLE public.product_aliases
      ADD CONSTRAINT product_aliases_product_id_fkey
      FOREIGN KEY (product_id)
      REFERENCES public.products(id)
      ON DELETE CASCADE;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS product_aliases_market_raw_name_idx
  ON public.product_aliases(market_id, raw_name);

