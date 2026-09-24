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
| Deploy Vercel | ⬜ Fase 1 item 7 |

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
