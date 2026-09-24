-- MercadoRadar - schema inicial (Passo 4 do docs/FASE-0-arquitetura.md)
create extension if not exists "pgcrypto";

-- Catalogo
create table markets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  logo_url text,
  website_url text,
  osuper_api_url text,
  osuper_store_id text,
  city text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  parent_id uuid references categories(id) on delete set null,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  brand text,
  category_id uuid references categories(id) on delete set null,
  barcode text,
  unit text,
  quantity numeric,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  market_id uuid not null references markets(id) on delete cascade,
  raw_name text not null,
  created_at timestamptz not null default now(),
  unique(product_id, market_id, raw_name)
);

create table price_sources (
  id smallint primary key,
  name text unique not null
);

create table prices (
  id bigint generated always as identity primary key,
  product_id uuid not null references products(id) on delete cascade,
  market_id uuid not null references markets(id) on delete cascade,
  price numeric(10,2) not null check (price > 0),
  promotional_price numeric(10,2) check (promotional_price is null or promotional_price > 0),
  source_id smallint references price_sources(id),
  source_url text,
  collected_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index prices_product_collected_idx on prices(product_id, collected_at desc);
create index prices_market_collected_idx on prices(market_id, collected_at desc);

-- Usuario
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references shopping_lists(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  quantity numeric not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  unique(list_id, product_id)
);

create table favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('product','market','list')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique(user_id, target_type, target_id)
);

create table price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  market_id uuid references markets(id) on delete set null,
  target_price numeric check (target_price is null or target_price > 0),
  drop_percent numeric check (drop_percent is null or (drop_percent > 0 and drop_percent <= 100)),
  notify_lowest boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  alert_id uuid references price_alerts(id) on delete set null,
  title text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Observabilidade
create table scrape_runs (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references markets(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('SUCCESS','PARTIAL','FAILED')),
  products_found int not null default 0,
  products_valid int not null default 0,
  products_ignored int not null default 0,
  products_new int not null default 0,
  products_updated int not null default 0,
  error_summary text,
  duration_ms int
);

create table scrape_errors (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references scrape_runs(id) on delete cascade,
  product_url text,
  error_type text,
  message text,
  created_at timestamptz not null default now()
);

-- updated_at helper
create or replace function set_updated_at()
returns trigger language plpgsql as $func$
begin new.updated_at = now(); return new; end $func$;
create trigger markets_updated_at before update on markets for each row execute function set_updated_at();
create trigger categories_updated_at before update on categories for each row execute function set_updated_at();
create trigger products_updated_at before update on products for each row execute function set_updated_at();
create trigger shopping_lists_updated_at before update on shopping_lists for each row execute function set_updated_at();

-- profiles auto no signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $func$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $func$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- is_admin() para politicas RLS
create or replace function is_admin()
returns boolean language sql security definer set search_path = public stable as $func$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$func$;

-- RLS
alter table markets enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table product_aliases enable row level security;
alter table price_sources enable row level security;
alter table prices enable row level security;
alter table profiles enable row level security;
alter table shopping_lists enable row level security;
alter table shopping_list_items enable row level security;
alter table favorites enable row level security;
alter table price_alerts enable row level security;
alter table notifications enable row level security;
alter table scrape_runs enable row level security;
alter table scrape_errors enable row level security;

-- Catalogo: SELECT publico
create policy "catalogo publico" on markets for select using (true);
create policy "catalogo publico" on categories for select using (true);
create policy "catalogo publico" on products for select using (true);
create policy "catalogo publico" on product_aliases for select using (true);
create policy "catalogo publico" on price_sources for select using (true);
create policy "catalogo publico" on prices for select using (true);
-- Escrita de catalogo: so admin (service_role bypassa RLS)
create policy "catalogo escrita admin" on markets for all using (is_admin()) with check (is_admin());
create policy "catalogo escrita admin" on categories for all using (is_admin()) with check (is_admin());
create policy "catalogo escrita admin" on products for all using (is_admin()) with check (is_admin());
create policy "catalogo escrita admin" on product_aliases for all using (is_admin()) with check (is_admin());
create policy "catalogo escrita admin" on price_sources for all using (is_admin()) with check (is_admin());
create policy "catalogo escrita admin" on prices for all using (is_admin()) with check (is_admin());

-- profiles: usuario le a propria; admin le todas
create policy "proprio perfil" on profiles for select using (auth.uid() = id or is_admin());
create policy "atualiza proprio perfil" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Tabelas de usuario: so as proprias linhas
create policy "proprio usuario" on shopping_lists for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "proprio usuario" on favorites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "proprio usuario" on price_alerts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "proprio usuario" on notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "itens da propria lista" on shopping_list_items for all using (
  exists (select 1 from shopping_lists l where l.id = list_id and l.user_id = auth.uid())
) with check (
  exists (select 1 from shopping_lists l where l.id = list_id and l.user_id = auth.uid())
);

-- scrape: leitura so admin; escrita so admin/service_role
create policy "scrape leitura admin" on scrape_runs for select using (is_admin());
create policy "scrape escrita admin" on scrape_runs for all using (is_admin()) with check (is_admin());
create policy "scrape leitura admin" on scrape_errors for select using (is_admin());
create policy "scrape escrita admin" on scrape_errors for all using (is_admin()) with check (is_admin());
