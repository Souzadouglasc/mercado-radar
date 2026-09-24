// Apply migrations via Supabase REST API (PostgREST)
const SUPABASE_URL = 'https://ufvatsvbvpnvueefpnaw.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmdmF0c3ZidnBuenVlZWZwYWl3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODU2ODg0NywiZXhwIjoyMDc0MTQ0ODQ3fQ.RcHmM8n3qK_7UQUZ5XqPwH0XhjKl_o-XVQqZ2a7zTDz0';

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal'
};

async function execSQL(sql, label) {
  // Use the exec_sql RPC
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sql })
  });
  
  const text = await res.text();
  console.log(`[${label}] Status: ${res.status}`);
  if (res.status >= 400) {
    console.log(`[${label}] Error: ${text}`);
  } else {
    console.log(`[${label}] OK`);
  }
  return res.status < 400;
}

const m004 = `
update markets
set osuper_store_id = '1638',
    city = 'São José',
    website_url = 'https://fortatacadista.com.br',
    osuper_api_url = 'https://api.fortatacadista.com.br/storefront/graphql',
    updated_at = now()
where slug = 'fort';

update markets
set osuper_store_id = '1412',
    city = 'São José (atendida por Palhoça)',
    website_url = 'https://www.superkoch.com.br',
    osuper_api_url = 'https://api.superkoch.com.br/storefront/graphql',
    updated_at = now()
where slug = 'koch';
`;

const m005 = `
create extension if not exists "pgcrypto";

create table if not exists list_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  icon text,
  is_default boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists list_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references list_templates(id) on delete cascade,
  product_name text not null,
  brand text,
  quantity numeric not null default 1 check (quantity > 0),
  unit text,
  category_hint text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table shopping_list_items add column if not exists custom_name text;

alter table list_templates enable row level security;
alter table list_template_items enable row level security;

create policy "templates publico" on list_templates for select using (true);
create policy "templates escrita admin" on list_templates for all using (is_admin()) with check (is_admin());

create policy "template_items publico" on list_template_items for select using (true);
create policy "template_items escrita admin" on list_template_items for all using (is_admin()) with check (is_admin());

insert into list_templates (name, slug, description, icon, is_default, sort_order) values
  ('Rancho do Mês', 'rancho-do-mes', '~20 itens típicos para abastecer a despensa do mês', '🛒', true, 1),
  ('Compra Semanal', 'compra-semanal', '~12 itens essenciais para a semana', '📦', false, 2),
  ('Limpeza da Casa', 'limpeza-da-casa', '~8 produtos de limpeza e higiene doméstica', '🧽', false, 3),
  ('Churrasco', 'churrasco', '~10 itens para o churrasco de fim de semana', '🥩', false, 4)
on conflict (slug) do nothing;

insert into list_template_items (template_id, product_name, brand, quantity, unit, category_hint, sort_order) values
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Arroz tipo 1', 'Tio João', 5, 'kg', 'Mercearia', 1),
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Feijão carioca', 'Camil', 2, 'kg', 'Mercearia', 2),
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Óleo de soja', 'Liza', 1, 'L', 'Mercearia', 3),
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Açúcar refinado', 'União', 2, 'kg', 'Mercearia', 4),
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Sal refinado', 'Cisne', 1, 'kg', 'Mercearia', 5),
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Macarrão espaguete', 'Renata', 2, 'un', 'Mercearia', 6),
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Farinha de trigo', 'Dona Benta', 1, 'kg', 'Mercearia', 7),
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Leite integral', 'Itambé', 6, 'L', 'Frios e Laticínios', 8),
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Manteiga', 'Aviação', 2, 'un', 'Frios e Laticínios', 9),
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Queijo mussarela', 'Presidente', 1, 'kg', 'Frios e Laticínios', 10),
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Ovos brancos', 'Mantiqueira', 2, 'dz', 'Mercearia', 11),
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Café torrado e moído', 'Melitta', 1, 'kg', 'Mercearia', 12),
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Açúcar refinado', 'União', 1, 'kg', 'Mercearia', 13),
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Molho de tomate', 'Elefante', 4, 'un', 'Mercearia', 14),
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Atum em conserva', 'Gomes da Costa', 4, 'un', 'Mercearia', 15),
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Salsicha', 'Seara', 2, 'un', 'Frios e Laticínios', 16),
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Pão de forma', 'Pullman', 2, 'un', 'Padaria', 17),
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Margarina', 'Doriana', 2, 'un', 'Frios e Laticínios', 18),
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Detergente líquido', 'Ypê', 1, 'L', 'Limpeza', 19),
  ((select id from list_templates where slug = 'rancho-do-mes'), 'Papel higiênico', 'Personal', 1, 'pct', 'Higiene e Beleza', 20)
on conflict do nothing;

insert into list_template_items (template_id, product_name, brand, quantity, unit, category_hint, sort_order) values
  ((select id from list_templates where slug = 'compra-semanal'), 'Banana prata', null, 2, 'kg', 'Hortifruti', 1),
  ((select id from list_templates where slug = 'compra-semanal'), 'Maçã gala', null, 1, 'kg', 'Hortifruti', 2),
  ((select id from list_templates where slug = 'compra-semanal'), 'Tomate', null, 1, 'kg', 'Hortifruti', 3),
  ((select id from list_templates where slug = 'compra-semanal'), 'Cebola', null, 1, 'kg', 'Hortifruti', 4),
  ((select id from list_templates where slug = 'compra-semanal'), 'Alface', null, 2, 'un', 'Hortifruti', 5),
  ((select id from list_templates where slug = 'compra-semanal'), 'Pão francês', null, 1, 'kg', 'Padaria', 6),
  ((select id from list_templates where slug = 'compra-semanal'), 'Leite integral', 'Itambé', 3, 'L', 'Frios e Laticínios', 7),
  ((select id from list_templates where slug = 'compra-semanal'), 'Ovos brancos', 'Mantiqueira', 1, 'dz', 'Mercearia', 8),
  ((select id from list_templates where slug = 'compra-semanal'), 'Manteiga', 'Aviação', 1, 'un', 'Frios e Laticínios', 9),
  ((select id from list_templates where slug = 'compra-semanal'), 'Iogurte natural', 'Nestlé', 4, 'un', 'Frios e Laticínios', 10),
  ((select id from list_templates where slug = 'compra-semanal'), 'Frango inteiro', 'Seara', 1, 'kg', 'Açougue', 11),
  ((select id from list_templates where slug = 'compra-semanal'), 'Detergente líquido', 'Ypê', 1, 'L', 'Limpeza', 12)
on conflict do nothing;

insert into list_template_items (template_id, product_name, brand, quantity, unit, category_hint, sort_order) values
  ((select id from list_templates where slug = 'limpeza-da-casa'), 'Detergente líquido', 'Ypê', 1, 'L', 'Limpeza', 1),
  ((select id from list_templates where slug = 'limpeza-da-casa'), 'Sabão em pó', 'OMO', 1, 'kg', 'Limpeza', 2),
  ((select id from list_templates where slug = 'limpeza-da-casa'), 'Amaciante', 'Downy', 1, 'L', 'Limpeza', 3),
  ((select id from list_templates where slug = 'limpeza-da-casa'), 'Desinfetante', 'Pinho Sol', 1, 'L', 'Limpeza', 4),
  ((select id from list_templates where slug = 'limpeza-da-casa'), 'Limpa vidros', 'Veja', 1, 'un', 'Limpeza', 5),
  ((select id from list_templates where slug = 'limpeza-da-casa'), 'Esponja de aço', 'Bombril', 1, 'pct', 'Limpeza', 6),
  ((select id from list_templates where slug = 'limpeza-da-casa'), 'Saco de lixo 100L', 'Fortlev', 1, 'pct', 'Limpeza', 7),
  ((select id from list_templates where slug = 'limpeza-da-casa'), 'Papel toalha', 'Scott', 1, 'pct', 'Limpeza', 8)
on conflict do nothing;

insert into list_template_items (template_id, product_name, brand, quantity, unit, category_hint, sort_order) values
  ((select id from list_templates where slug = 'churrasco'), 'Picanha', 'Friboi', 1, 'kg', 'Açougue', 1),
  ((select id from list_templates where slug = 'churrasco'), 'Linguiça toscana', 'Seara', 1, 'kg', 'Açougue', 2),
  ((select id from list_templates where slug = 'churrasco'), 'Coração de frango', 'Seara', 1, 'kg', 'Açougue', 3),
  ((select id from list_templates where slug = 'churrasco'), 'Carvão vegetal', 'Kingsford', 1, 'saco', 'Mercearia', 4),
  ((select id from list_templates where slug = 'churrasco'), 'Cerveja lata', 'Brahma', 12, 'un', 'Bebidas', 5),
  ((select id from list_templates where slug = 'churrasco'), 'Refrigerante cola', 'Coca-Cola', 2, 'L', 'Bebidas', 6),
  ((select id from list_templates where slug = 'churrasco'), 'Gelo', 'Polar', 2, 'kg', 'Mercearia', 7),
  ((select id from list_templates where slug = 'churrasco'), 'Farofa pronta', 'Yoki', 1, 'un', 'Mercearia', 8),
  ((select id from list_templates where slug = 'churrasco'), 'Vinagrete', 'Caseiro', 1, 'un', 'Hortifruti', 9),
  ((select id from list_templates where slug = 'churrasco'), 'Pão de alho', 'Santa Massa', 2, 'un', 'Padaria', 10)
on conflict do nothing;

grant select on list_templates to anon, authenticated;
grant select on list_template_items to anon, authenticated;
`;

const m007 = `
alter table public.products
add column if not exists image_url text;

create index if not exists idx_products_image_url on public.products (image_url) where image_url is not null;

comment on column public.products.image_url is 'URL da imagem do produto (JSON-LD og:image / product:image). Preenchido pela coleta automática.';
`;

async function main() {
  console.log('Applying 0004_sao-jose.sql...');
  await execSQL(m004, '0004');
  
  console.log('Applying 0005_templates.sql...');
  await execSQL(m005, '0005');
  
  console.log('Applying 0007_images.sql...');
  await execSQL(m007, '0007');
  
  // Verify
  console.log('\nVerifying markets...');
  const marketsRes = await fetch(`${SUPABASE_URL}/rest/v1/markets?select=slug,city,osuper_store_id`, { headers });
  const markets = await marketsRes.json();
  console.log('Markets:', JSON.stringify(markets, null, 2));
  
  console.log('\nVerifying list_templates...');
  const templatesRes = await fetch(`${SUPABASE_URL}/rest/v1/list_templates?select=id,name,slug`, { headers });
  const templates = await templatesRes.json();
  console.log('Templates:', JSON.stringify(templates, null, 2));
  
  console.log('\nVerifying products.image_url...');
  const productsRes = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,name,image_url&limit=5`, { headers });
  const products = await productsRes.json();
  console.log('Products:', JSON.stringify(products, null, 2));
  
  console.log('\nDone.');
}

main();