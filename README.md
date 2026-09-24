# MercadoRadar

Compare preços de supermercados da região (Fort, Koch, Brasil, Komprão). Mobile-first, PWA, pt-BR, custo R$ 0.

> Autoridade técnica: [`docs/FASE-0-arquitetura.md`](docs/FASE-0-arquitetura.md) — schema, pastas, envs e plano da Fase 1.

## Status — Fase 1 (Foundation)

| Item | Estado |
|---|---|
| Scaffold Next.js 14+ (TS, App Router, Tailwind, ESLint) | ✅ |
| shadcn/ui (button, input, card, badge, skeleton, dialog, dropdown-menu, sheet, table, select) | ✅ |
| PWA (manifest + SW mínimo + icons SVG) | ✅ |
| Layout mobile-first + dark mode (`next-themes`) | ✅ |
| Design tokens (primária verde, `.price`/`.price-lg` tabular) | ✅ |
| Rotas `/`, `/produtos/[slug]`, `/mercados/[slug]` (+ buscar, listas, alertas, conta) | ✅ placeholders |
| SEO (`sitemap.ts`, `robots.ts`, metadata por rota) | ✅ |
| Projeto Supabase + migration + seed | ✅ (`supabase/migrations/`) |
| Auth + `/admin` com guarda `is_admin` | ✅ (Supabase Auth pt-BR, `/admin` 404 p/ não-admin) |
| CRUD admin + dashboard de comparação | ✅ (server actions + `POST /api/ingest/prices`) |
| Deploy Vercel | ✅ `https://mercado-radar.vercel.app` (prod) |

Critério de aceite Fase 1: usuário cadastra produto, lança preço manual em 2 mercados e vê comparação — sem nenhum scraper.

## Status — Tarefa C (listas, gráficos, favoritos, alertas-base)

| Item | Estado |
|---|---|
| Listas reais (`/listas`, `/listas/[id]`, login) | ✅ CRUD via server actions com RLS |
| Cálculo da cesta (`lib/basket/calc.ts` + `npm test`) | ✅ total/mercado, indisponível, dividida, economia |
| Comparação em `/listas/[id]` | ✅ cards ordenados, vencedor verde, compra dividida |
| Gráfico de histórico (`recharts`, `?range=7d/30d/90d/6m/1y`) | ✅ linha multi-mercado, tooltip pt-BR, downsample 300 |
| Favoritos (produto + mercado, `/favoritos`) | ✅ tabela `favorites` com RLS |
| Dashboard `/` (quedas > 5%, perto do mínimo) | ✅ `biggestDrops`/`nearHistoricLow`, limite 5 |
| Alertas-base (`/alertas`, sem e-mail) | ✅ CRUD `price_alerts` + lista `notifications` |

Como testar: cadastre-se em `/conta` → crie lista em `/listas` → adicione
produtos (busca com debounce) → ajuste quantidades no stepper → veja
comparação por mercado + compra dividida em `/listas/[id]`. Gráfico em
`/produtos/[slug]?range=30d`. Favoritos via coração em produto/mercado,
lista em `/favoritos`. Alertas em `/alertas` (disparo na coleta, Fase 5).

## Design system + Performance (Tarefa F)

**Tokens** (`app/globals.css`): primária verde economia (`--primary`,
light `#178a4c` / dark refinado `#0c3b24` fundo), âmbar oferta (`--offer`),
vermelho aumento (`--rise`); contraste AA. Preços sempre tabulares via
`.price` / `.price-lg` / `.price-hero` / `.price-line`
(`font-variant-numeric: tabular-nums`). Dark mode próprio (verde profundo,
não inversão). Logo SVG próprio (`components/logo.tsx`), favicon
(`public/favicon.svg`), PWA icons coerentes, OG image default
(`app/opengraph-image.tsx`).

**Leitura em 1 round-trip** (`supabase/migrations/0003_perf.sql`):
view `latest_prices` (último preço por produto×mercado) + RPC
`latest_prices_for_products(uuid[])` (`DISTINCT ON (product_id, market_id)`),
usada por `latestPricesBatch()` em `lib/catalog/queries.ts` (home, produto,
mercado, lista). Busca full-text pt-BR via RPC `search_products_ft`
(`to_tsvector('portuguese', nome + marca)` + fallback ilike) com índice GIN
+ trigram `pg_trgm` (`products_name_trgm_idx`, `products_brand_trgm_idx`).
Índices: `prices(product_id, collected_at desc)`, `prices(market_id,
collected_at desc)`. RLS intacto (grants só `select`/`execute` p/ anon).

**Cache**: `unstable_cache` 300s p/ catálogo/estatísticas
(`lib/catalog/cached.ts`, client anônimo sem cookies), ISR `revalidate = 300`
em `/produtos/[slug]` e `/mercados/[slug]`, `loading.tsx` + Suspense por
seção na home e `app/loading.tsx` raiz. **Bundle**: `recharts` só na página
de produto via `dynamic(..., { ssr: false })`; imagens `next/image` com
`sizes` + lazy (`edge.osuper.com.br`, Supabase em `remotePatterns`).

Aplicar a migration 0003 (idempotente, só leitura — aplicar uma vez):

```bash
npx supabase db push   # ou: SQL Editor → cole supabase/migrations/0003_perf.sql
```

## Pré-requisitos

- Node 22+ e npm
- Conta Supabase (free tier) — próxima tarefa
- Conta Vercel (free tier) — deploy

## Setup

```bash
npm install
cp .env.example .env.local   # preencha (veja “Supabase” abaixo)
npm run dev                  # http://localhost:3000
npm run build                # deve passar sem erro
```

## Supabase

1. Crie um projeto free em [supabase.com](https://supabase.com) (região `sa-east-1`).
2. Aplique o schema + seed — escolha uma:
   - CLI: `npx supabase db push` (com `SUPABASE_DB_URL` do dashboard), ou
   - Dashboard → SQL Editor → cole `supabase/migrations/0001_initial.sql` e depois
     `supabase/migrations/0002_seed.sql`.
3. Copie **Project URL** e **anon key** (Settings → API) para `.env.local`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Gere um `CRON_SECRET` forte (`openssl rand -hex 32`) e coloque em `.env.local`
   (e depois no GH Secrets da Fase 4). Copie a **service_role key** para
   `SUPABASE_SERVICE_ROLE_KEY` — **servidor apenas, nunca exponha no client**.
5. Cadastre-se em `/conta` e promova o primeiro admin no SQL Editor:

   ```sql
   update profiles set is_admin = true where id = (
     select id from auth.users where email = 'seu@email.com'
   );
   ```

6. Acesse `/admin` (CRUD mercados/categorias/produtos/preços) e `/admin/runs`
   (histórico de coletas). Sem `.env.local`, as páginas mostram empty states
   explicativos e o build continua passando.

## Variáveis de ambiente

| Variável | Onde | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Chave anon (segura no client) |
| `SUPABASE_SERVICE_ROLE_KEY` | **servidor apenas** | Usada só em `app/api/ingest/*`. Nunca com prefixo `NEXT_PUBLIC_`. |
| `CRON_SECRET` | servidor + GH Secrets | `Authorization: Bearer` no `POST /api/ingest/prices` |
| `NEXT_PUBLIC_SITE_URL` | client | URL pública (sitemap/robots/OG) |

GH Secrets (Fase 4): `APP_URL`, `CRON_SECRET` (`SUPABASE_URL` não é usada direto pelo scraper).

## Deploy (produção)

App em produção: **https://mercado-radar.vercel.app**

Projeto Vercel: `souzadouglascs-projects/mercado-radar` (link via `vercel link`,
deploy com `vercel --prod`).

Env vars em produção (Vercel → Production): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`,
`NEXT_PUBLIC_SITE_URL=https://mercado-radar.vercel.app`.

GH Secrets: `APP_URL` (= URL de produção), `CRON_SECRET` (= mesmo valor da
Vercel). Nunca logar valores.

Validação pós-deploy:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://mercado-radar.vercel.app/
curl -s "https://mercado-radar.vercel.app/api/search?q=arroz"
# Ingestão (Bearer = CRON_SECRET de produção):
curl -X POST https://mercado-radar.vercel.app/api/ingest/prices \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -d '{"items":[{"product_name":"Arroz Teste","price":9.99,"market_slug":"fort","source":"manual","collected_at":"<ISO-8601>"}]}'
# Scraper dry-run:
gh workflow run scrape-fort.yml -f limit=5 -f dry_run=true
```

## Limites do free tier (R$ 0)

| Serviço | Limite free | Uso estimado |
|---|---|---|
| Supabase | 500 MB banco, 50k MAU | Folga: catálogo + preços diários de ~4 mercados |
| Vercel | 100 GB banda/mês | Folga: app mobile-first, páginas leves |
| GitHub Actions | 2.000 min/mês | Scraper diário 06:00 BRT ~5 min/dia ≈ 150 min/mês |

## Estrutura

```
app/                    # App Router (mobile-first, PWA, pt-BR)
├── page.tsx            # dashboard (último preço por mercado)
├── produtos/[slug]/    # preços por mercado + estatísticas
├── mercados/[slug]/    # produtos recentes do mercado
├── buscar/             # busca com debounce (Supabase ilike)
├── (admin)/admin/      # CRUD + /admin/runs (guarda is_admin → 404)
├── auth/callback/      # callback do Supabase Auth
├── api/ingest/prices/  # POST com CRON_SECRET (service_role no server)
├── listas/               # CRUD + /listas/[id] (comparação + compra dividida)
├── alertas/              # CRUD price_alerts + notificações (base, sem e-mail)
├── favoritos/ conta/     # favoritos usuário; conta = auth pt-BR
├── api/search/           # autocomplete p/ adicionar itens na lista
├── sitemap.ts robots.ts
components/ui/          # shadcn/ui (New York, Zinc, CSS variables)
components/             # site-header, bottom-nav, theme-provider, empty-state, price
lib/utils.ts            # cn() + formatPriceBRL()
public/                 # manifest.webmanifest, sw.js, icons SVG
supabase/migrations/    # (próxima tarefa — schema do Passo 4)
scrapers/               # (Fase 4 — TS, GH Actions)
docs/                   # FASE-0-arquitetura.md
```

## Scripts

| Script | Descrição |
|---|---|
| `npm run dev` | Desenvolvimento |
| `npm run build` | Build de produção (validação da Tarefa A) |
| `npm run start` | Servir build |
| `npm run lint` | ESLint |
| `npm test` | Testes da cesta (`lib/basket/calc.test.ts`, node:test) |

## Convenções

- UI em pt-BR. Preço sempre com `.price` / `.price-lg` (fonte tabular) via `formatPriceBRL()`.
- Loading skeletons e empty states onde houver dado futuro (Supabase/scrapers).
- Sem dependências pagas. Sem `SUPABASE_SERVICE_ROLE_KEY` com prefixo `NEXT_PUBLIC_`.
