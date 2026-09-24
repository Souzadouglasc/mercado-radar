-- 0007_images.sql
-- Adiciona coluna image_url à tabela products e backfill placeholder

alter table public.products
add column if not exists image_url text;

-- Backfill: placeholder por categoria (será sobrescrito pela coleta real)
-- O extrator JSON-LD já captura 'image' - esta migration apenas garante a coluna.
-- Placeholders visuais serão feitos via componente ProductImage (SVG por categoria).

-- Índice opcional para busca por produtos com imagem
create index if not exists idx_products_image_url on public.products (image_url) where image_url is not null;

-- Comentário para documentação
comment on column public.products.image_url is 'URL da imagem do produto (JSON-LD og:image / product:image). Preenchido pela coleta automática.';