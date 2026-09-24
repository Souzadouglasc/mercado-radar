# MercadoRadar — Documentação Completa do Projeto

## Visão Geral
**MercadoRadar** é um comparador de preços de supermercados (Next.js 16 + Supabase/PostgreSQL + GitHub Actions + Vercel) focado na região de São José/SC. Coleta preços de 4 redes automaticamente e oferece busca, comparação por categoria, listas de compras com templates e alertas de preço.

---

## Stack Tecnológica
- **Frontend**: Next.js 16 (App Router, React 19, TypeScript, Turbopack)
- **Backend/DB**: Supabase (PostgreSQL, PostgREST, Auth, Realtime)
- **Scrapers**: TypeScript (Node 22), executados via GitHub Actions
- **Deploy**: Vercel (frontend) + GitHub Actions (scrapers agendados)
- **Infra**: Zero custo fixo além de Vercel/Netlify/Supabase free tiers

---

## Mercados Coletados
| Mercado | Slug | Tipo | Store ID | Cidade | Status |
|---------|------|------|----------|--------|--------|
| Fort Atacadista | `fort` | Osuper (GraphQL) | 1638 | São José | ✅ Produção |
| SuperKoch | `koch` | Osuper (GraphQL) | 1412 | São José (atendida por Palhoça) | ✅ Produção |
| Brasil Atacadista | `brasil` | WordPress (encartes) | — | São José | ✅ Produção |
| Komprão | `komprao` | WordPress (ofertas custom post type `oferta`) | — | São José | ✅ Produção |

---

## Arquitetura de Scrapers (Provider Pattern)

```
scrapers/
├── core/
│   ├── provider.ts              # Interface MarketProvider + types (CollectOptions, NormalizedProduct, etc.)
│   ├── providers/
│   │   ├── base-http-provider.ts  # Base: throttle, retry, concurrency, takeoff mutex, UA rotation
│   │   ├── osuper/
│   │   │   ├── index.ts          # OsuperProvider (Fort/Koch) — sitemap → JSON-LD → ProductPrice
│   │   │   ├── sitemap.ts        # Parser de sitemap.xml (incremental, sharding)
│   │   │   └── jsonld.ts         # Extração JSON-LD (normaliza image para string)
│   │   └── wordpress/
│   │       └── index.ts          # WordPressProvider (Brasil/Komprao) — wp-json REST API → encartes/ofertas
│   ├── catalog.ts               # Match/cria canonical_products via EAN → alias → fuzzy name
│   ├── ingest-client.ts         # Escrita direta no Supabase (service_role): upsert canonical_products + products + prices + aliases
│   ├── normalize.ts             # normalizeName, parsePrice, slugify, toBaseQuantity
│   └── supabase.ts              # Cliente service_role standalone
├── config/
│   └── markets.config.ts        # Registro declarativo: slug, provider, config, schedule, baseline
├── registry/
│   └── index.ts                 # ProviderRegistry (factory singleton, inicializa de config)
├── runner/
│   ├── orchestrator.ts          # Pipeline: collect → normalize → catalog → ingest → alerts
│   └── run.ts                   # CLI: --market/--markets --limit --dry-run --concurrency --incremental/--full --skip
└── lib/
    └── supabase.ts
```

### Fluxo de Dados
1. **Runner** lê `markets.config.ts` → instancia providers via `ProviderRegistry`
2. **Provider.collect()** → busca URLs (sitemap GraphQL ou wp-json) → retorna `NormalizedProduct[]`
3. **Orchestrator** → `CatalogService.matchOrCreate()` (canonical_products via EAN/alias/fuzzy)
4. **IngestClient** → upsert direto no Supabase:
   - `canonical_products` (1 por produto real)
   - `products` (1 por mercado, FK `normalized_id` → canonical_products)
   - `prices` (histórico de preços, FK `product_id` + `market_id`)
   - `product_aliases` (nome bruto por mercado, FK `canonical_id` + `market_id` + `market_sku`)
5. **Scrape_run** registrado com métricas (found/valid/ignored/new/updated/errors)

---

## Schema do Banco (Principais Tabelas)

```sql
-- Catálogo normalizado (1 linha por produto real)
canonical_products (
  id UUID PK,
  canonical_name TEXT,
  brand TEXT,
  barcode TEXT,
  unit TEXT,
  quantity NUMERIC,
  normalized_unit TEXT,
  normalized_quantity NUMERIC,
  category_id UUID REFERENCES categories(id),
  image_url TEXT,
  created_at, updated_at
)

-- Produto por mercado (market-specific)
products (
  id UUID PK,
  name TEXT,
  slug TEXT,
  brand TEXT,
  barcode TEXT,
  unit TEXT,
  quantity NUMERIC,
  image_url TEXT,
  normalized_id UUID REFERENCES canonical_products(id),
  market_id UUID REFERENCES markets(id),
  last_seen_at TIMESTAMPTZ,
  active BOOLEAN,
  UNIQUE(slug, market_id)
)

-- Histórico de preços
prices (
  id UUID PK,
  product_id UUID REFERENCES products(id),
  market_id UUID REFERENCES markets(id),
  price NUMERIC CHECK (price > 0),
  promotional_price NUMERIC,
  source_id INT REFERENCES price_sources(id),
  source_url TEXT,
  collected_at TIMESTAMPTZ
)

-- Aliases para matching futuro
product_aliases (
  id UUID PK,
  canonical_id UUID REFERENCES canonical_products(id) ON DELETE CASCADE,
  market_id UUID REFERENCES markets(id),
  raw_name TEXT,
  market_sku TEXT,
  UNIQUE(canonical_id, market_id, market_sku)
)

-- Execuções de scrape
scrape_runs (
  id UUID PK,
  market_id UUID REFERENCES markets(id),
  status TEXT, -- SUCCESS|PARTIAL|FAILED
  started_at, finished_at TIMESTAMPTZ,
  products_found, products_valid, products_ignored, products_new, products_updated INT,
  error_summary TEXT,
  duration_ms INT
)

-- Alertas de preço (fase 2)
price_alerts (
  id UUID PK,
  user_id UUID,
  canonical_product_id UUID REFERENCES canonical_products(id),
  target_price NUMERIC,
  rule JSONB, -- {type: "below"|"drop_pct", value: 10}
  active BOOLEAN,
  created_at
)

-- Ações de scrape dinâmicas (fase 2)
scrape_actions (
  id UUID PK,
  market_slug TEXT,
  product_url TEXT,
  priority INT,
  status TEXT, -- pending|running|done|failed
  created_at
)
```

---

## APIs Principais (Frontend)

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/search` | GET | Busca full-text em `canonical_products` (RPC `search_products_ft`) |
| `/api/categories` | GET | Lista categorias com contagem de produtos |
| `/api/categories/[id]/comparison` | GET | Compara preços por mercado para uma categoria |
| `/api/templates` | GET/POST | CRUD de templates de lista (seed: 4 templates) |
| `/api/templates/[id]` | GET/POST/DELETE | Instancia lista a partir de template |
| `/api/ingest/prices` | POST | Ingest legado (mantido para compat) |

---

## GitHub Actions (`.github/workflows/scrape-all.yml`)
- **Trigger**: `cron: '0 9 * * 1-6'` (06:00 BRT seg-sab) + `workflow_dispatch`
- **Matrix**: lê `getEnabledSlugs()` → executa 4 jobs paralelos (fort, koch, brasil, komprao)
- **Flags**: `--limit 200 --concurrency 4`
- **Secrets**: `APP_URL`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`

---

## Configuração Local
```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://ufvatsvbvpnvueefpnaw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...  # SEM trailing newline!
CRON_SECRET=...
APP_URL=https://mercado-radar.vercel.app
```

```bash
# Instalar
npm install

# Testes
npm test          # 36 passing

# Build
npm run build     # Next.js + TS clean

# Scrapers (local)
npx tsx scrapers/runner/run.ts --market fort --limit 5 --dry-run
npx tsx scrapers/runner/run.ts --markets fort,koch,brasil,komprao --limit 200
```

---

## Migrações Aplicadas (Supabase Dashboard)
| Arquivo | Descrição |
|---------|-----------|
| `0001_initial_schema.sql` | Schema base |
| `0002_price_alerts.sql` | price_alerts (estrutura inicial) |
| `0003_perf.sql` | View `latest_prices` + RPCs `latest_prices_for_products`, `search_products_ft` |
| `0004_sao-jose.sql` | Atualiza store_ids Fort/Koch para São José |
| `0005_templates.sql` | `list_templates`, `list_template_items`, seed 4 templates |
| `0007_images.sql` | `products.image_url` |
| `0008_normalized_catalog.sql` | `canonical_products`, `products.normalized_id`, `product_aliases.market_sku`, RPC `upsert_canonical_product` |
| `0009_alerts_scrape_actions.sql` | `price_alerts` regras, `scrape_actions`, RPCs `get_next_scrape_action`/`complete_scrape_action` |

> **Nota**: Migrações 0005, 0007, 0008, 0009 contêm DDL — devem ser aplicadas via **Supabase Dashboard > SQL Editor** (não via `supabase db push`).

---

## Comandos Úteis

```bash
# Verificar scrape_runs recentes
curl -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  "$SUPABASE_URL/rest/v1/scrape_runs?select=*&order=started_at.desc&limit=10"

# Verificar canonical_products
curl ... "canonical_products?select=id,canonical_name&limit=10"

# Verificar products com market_id
curl ... "products?select=id,name,market_id,normalized_id&limit=10"

# Verificar prices recentes
curl ... "prices?select=product_id,price,collected_at&order=collected_at.desc&limit=10"
```

---

## URLs de Produção
- **App**: https://mercado-radar.vercel.app
- **Supabase**: https://ufvatsvbvpnvueefpnaw.supabase.co
- **GitHub**: https://github.com/Souzadouglasc/mercado-radar
- **GitHub Actions**: https://github.com/Souzadouglasc/mercado-radar/actions