# MercadoRadar — Fase 0: Arquitetura, Investigação e Plano Fase 1

Data: 2026-09-23. Status: investigação técnica executada (navegador real + curl). Nada implementado ainda.

## Passo 1 — Análise da arquitetura proposta

Aprovada com 2 ajustes:

1. **Scrapers em TypeScript (não Python).** Fort e Koch expõem GraphQL/JSON-LD; Brasil e Komprão são WordPress com wp-json. Tudo é HTTP+JSON — Node 22 no GitHub Actions resolve sem Playwright na maioria dos casos. Um runtime só = menos dependências, mesmos tipos do app.
2. **Escrita via API Route autenticada (não service_role no scraper).** O workflow do GitHub Actions chama `POST /api/ingest/prices` com `CRON_SECRET`. A rota valida o secret e usa service_role no servidor. A key nunca sai do servidor/GH Secrets.

Fluxo: `GH Actions (cron 06:00 BRT) → coleta → POST /api/ingest → Supabase`. Princípio R$ 0 mantido: Vercel + Supabase + GH Actions apenas.

## Passo 2 — Investigação real dos 4 mercados (verificado em 2026-09-23)

### Fort Atacadista — ✅ melhor caso: API pública + sitemap

- Loja virtual na plataforma **Osuper**. Endpoint GraphQL **aberto, sem auth**: `https://api.fortatacadista.com.br/storefront/graphql` (testado: `{__typename}` responde; `SearchActiveStoresQuery` responde).
- `storeId "1585"` = loja Balneário Camboriú. Introspection GraphQL **desabilitada** (resposta vazia) — operações precisam ser extraídas do bundle JS ou do tráfego do navegador.
- `robots.txt` **permite** `/produtos/` e `/categorias`, bloqueia `/busca`, `/search`, `/carrinho`, `/checkout`. Há `sitemap.xml` com **todas as URLs de produto**.
- Cada página `/produtos/<id>/<slug>` contém **JSON-LD `schema.org/Product`** com `offers.price`, `sku`, `brand`, `availability`. Preço extraível sem JS.
- Exemplo real capturado: `PANETTONE STA EDWIGES 400G ... price 49.90 BRL, sku 8199867`.

### Koch (SuperKoch) — ✅ mesmo caso do Fort

- Mesma plataforma Osuper. Endpoint aberto: `https://api.superkoch.com.br/storefront/graphql` (testado, responde sem auth).
- 12k+ produtos no online, loja `Superkoch LJ81 - Camboriú`. Encartes digitais por loja em `/encartes`.
- Estratégia idêntica à do Fort.

### Brasil Atacadista — ⚠️ WordPress, encartes são IMAGENS

- Site WordPress. `wp-json` aberto. Encartes publicados como **posts com JPEGs** (ex.: `campanha-73256-pagina-2-...jpeg` em várias resoluções).
- Página `/encarte/encarte-semanal/` estava com "SEM OFERTAS NO MOMENTO" no dia da consulta — encarte é sazonal.
- **Sem preço estruturado.** Estratégia: listar encartes via `wp-json/wp/v2/search?search=encarte`, baixar imagens, preços via cadastro manual no MVP (tabela `prices` com `source='manual'`) ou OCR depois. Não prometer coleta automática aqui na Fase 4.

### Komprão — ⚠️ WordPress institucional, loja Magento desativada

- `komprao.com.br` = WordPress (Yoast, sitemap aberto). Ofertas = páginas de **encarte por cidade** (`/ofertas/<cidade>/`), imagens, sem preço estruturado.
- A loja Magento antiga (`www.komprao.com.br`) **redireciona para o site novo** — e-commerce desativado.
- Estratégia: igual ao Brasil (encarte via download + manual/OCR). Komprão é do **mesmo Grupo Koch** — possível convergência futura com o SuperKoch.

### Resumo

| Mercado | Fonte | Formato | Coleta Fase 4 |
|---|---|---|---|
| Fort | GraphQL Osuper + sitemap + JSON-LD | Estruturado | Automática (provider Fort) |
| Koch | GraphQL Osuper + JSON-LD | Estruturado | Automática (provider Koch, reusa base Fort) |
| Brasil | wp-json (posts de encarte) | Imagens JPEG | Download automático + preço manual/OCR |
| Komprão | site WP (páginas por cidade) | Imagens | Download automático + preço manual/OCR |

Nada exige login, CAPTCHA ou bypass. Respeitar: robots do Fort (`/produtos` OK), 1 req/2s por mercado, cron 1x/dia 06:00 BRT.

## Passo 3 — Estratégia de coleta por mercado (Fase 4)

```
scrapers/
├── core/          # ProductPrice (zod), normalize(), supabase-ingest client
├── markets/
│   ├── fort/      # sitemap → /produtos/* → JSON-LD offers.price
│   ├── koch/      # igual Fort, outro endpoint + storeId
│   ├── brasil/    # wp-json → baixa JPEGs do encarte → fila p/ manual
│   └── komprao/   # sitemap WP → /ofertas/<cidade> → baixa imagens
└── runner/        # executa 1 provider, grava scrape_runs, POST /api/ingest
```

`ProductPrice = { product_name, brand, barcode?, unit, quantity?, price, promotional_price?, market_slug, source_url, collected_at }`. Falha isolada por provider: status `SUCCESS|PARTIAL|FAILED` em `scrape_runs`; alerta se `products_found < 30%` da mediana de 7 dias.

Pendente de confirmação na Fase 4: nome exato da operação GraphQL de listagem por categoria (está em chunk lazy do bundle; sitemap+JSON-LD já bastam p/ v1 do scraper).

## Passo 4 — Schema inicial PostgreSQL (Supabase)

```sql
-- Catálogo (leitura pública)
markets(id uuid pk, name text, slug text unique, logo_url text, website_url text,
  osuper_api_url text, osuper_store_id text, city text, active bool default true)
categories(id uuid pk, name text, slug text unique, parent_id fk categories, image_url text)
products(id uuid pk, name text, slug text unique, brand text, category_id fk,
  barcode text, unit text, quantity numeric, image_url text,
  active bool default true, created_at, updated_at)
product_aliases(id uuid pk, product_id fk, market_id fk, raw_name text,
  unique(product_id, market_id, raw_name))
price_sources(id smallint pk, name text unique) -- 'site-jsonld','graphql','manual','encarte'
prices(id bigint generated always as identity pk, product_id fk, market_id fk,
  price numeric(10,2) not null check (price > 0), promotional_price numeric(10,2),
  source_id fk, source_url text, collected_at timestamptz not null, created_at default now())
create index on prices(product_id, collected_at desc);
create index on prices(market_id, collected_at desc);

-- Usuário (RLS por auth.uid())
profiles(id uuid pk → auth.users, is_admin bool default false)
shopping_lists(id uuid pk, user_id fk, name text, created_at, updated_at)
shopping_list_items(id uuid pk, list_id fk cascade, product_id fk,
  quantity numeric default 1 check (quantity > 0), unique(list_id, product_id))
favorites(id uuid pk, user_id fk, target_type text check (in product/market/list),
  target_id uuid, unique(user_id, target_type, target_id))
price_alerts(id uuid pk, user_id fk, product_id fk, market_id fk nullable,
  target_price numeric nullable, drop_percent numeric nullable,
  notify_lowest bool default false, active bool default true)
notifications(id uuid pk, user_id fk, alert_id fk nullable, title text,
  message text, read bool default false, created_at)

-- Observabilidade (escrita via service_role, leitura admin)
scrape_runs(id uuid pk, market_id fk, started_at, finished_at,
  status text check (in SUCCESS/PARTIAL/FAILED),
  products_found/valid/ignored/new/updated int default 0,
  error_summary text, duration_ms int)
scrape_errors(id uuid pk, run_id fk cascade, product_url text,
  error_type text, message text, created_at)
```

RLS: catálogo + `prices` = SELECT público; tabelas de usuário = `auth.uid() = user_id`; `scrape_runs/errors` = SELECT para admins; escrita de catálogo = admins ou service_role.

## Passo 5 — Estrutura de pastas

```
mercado-radar/
├── app/                    # Next.js App Router (mobile-first, PWA, pt-BR)
│   ├── (public)/           # landing, /produtos/[slug], /mercados/[slug]
│   ├── (app)/              # dashboard, listas, alertas, favoritos (auth)
│   ├── admin/              # /admin (is_admin)
│   └── api/ingest/prices/  # POST com CRON_SECRET (service_role no server)
├── components/ui/          # shadcn/ui
├── lib/                    # supabase client/server, cálculos cesta, normalização
├── scrapers/               # core + markets/* + runner (TS, GH Actions)
├── supabase/migrations/    # SQL do Passo 4 em diante
├── .github/workflows/      # scrape-fort.yml, scrape-koch.yml, scrape-all.yml
└── docs/                   # este arquivo + estratégias por mercado
```

## Passo 6 — Variáveis de ambiente

```bash
# .env.local (Vercel + local)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # SÓ servidor (api/ingest). Nunca NEXT_PUBLIC.
CRON_SECRET=                    # GH Actions → Authorization: Bearer ...
```

GH Secrets: `SUPABASE_URL` (não usado direto), `APP_URL`, `CRON_SECRET`. Limites free tier p/ README: Supabase 500MB/50k MAU; Vercel 100GB banda; Actions 2.000 min/mês (scraper diário ~5 min = folga).

## Passo 7 — Plano Fase 1 (Foundation)

1. `create-next-app` (TS, App Router, Tailwind) + shadcn/ui + PWA manifest.
2. Projeto Supabase + migration do Passo 4 + RLS + seed (4 mercados, categorias base).
3. Auth (login/cadastro, `profiles` auto via trigger) + rota `/admin` com guarda `is_admin`.
4. Layout mobile-first + dark mode + design tokens (preço sempre em destaque).
5. CRUD admin: mercados, categorias, produtos, aliases, preços manuais.
6. Dashboard básico: busca de produto + último preço por mercado (query `distinct on (product_id, market_id)`).
7. README (setup, envs, limites free tier) + deploy Vercel.

Critério de aceite Fase 1: usuário cadastra produto, lança preço manual em 2 mercados e vê comparação — sem nenhum scraper.
