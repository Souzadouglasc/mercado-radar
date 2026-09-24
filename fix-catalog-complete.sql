-- Migração completa para normalizar catálogo e aliases
-- Execute no Supabase Dashboard > SQL Editor

-- 1. Adicionar coluna canonical_id em product_aliases
ALTER TABLE product_aliases 
ADD COLUMN IF NOT EXISTS canonical_id UUID;

-- 2. Atualizar canonical_id baseado em products.normalized_id
UPDATE product_aliases pa
SET canonical_id = p.normalized_id
FROM products p
WHERE pa.product_id = p.id
  AND p.normalized_id IS NOT NULL;

-- 3. Dropar FK antiga (product_id -> products)
ALTER TABLE product_aliases 
DROP CONSTRAINT IF EXISTS product_aliases_product_id_fkey;

-- 4. Adicionar FK nova (canonical_id -> canonical_products)
ALTER TABLE product_aliases 
ADD CONSTRAINT product_aliases_canonical_id_fkey 
FOREIGN KEY (canonical_id) REFERENCES canonical_products(id) ON DELETE CASCADE;

-- 5. Unique constraint para deduplicação
ALTER TABLE product_aliases 
DROP CONSTRAINT IF EXISTS product_aliases_canonical_market_sku_key;

ALTER TABLE product_aliases 
ADD CONSTRAINT product_aliases_canonical_market_sku_key 
UNIQUE (canonical_id, market_id, market_sku);

-- 6. Popular market_sku a partir do slug do product original
UPDATE product_aliases pa
SET market_sku = p.slug
FROM products p
WHERE pa.product_id = p.id
  AND pa.market_sku IS NULL;

-- 7. Verificar resultado
SELECT 
  'canonical_products' as tabela, count(*) as total FROM canonical_products
UNION ALL
SELECT 
  'products com normalized_id', count(*) FROM products WHERE normalized_id IS NOT NULL
UNION ALL
SELECT 
  'product_aliases com canonical_id', count(*) FROM product_aliases WHERE canonical_id IS NOT NULL
UNION ALL
SELECT 
  'product_aliases sem canonical_id', count(*) FROM product_aliases WHERE canonical_id IS NULL;