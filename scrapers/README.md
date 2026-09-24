# Scrapers MercadoRadar (Fase D — Fort + Koch via Osuper)

Coleta v1: `sitemap.xml` → HTML de `/produtos/*` → JSON-LD `schema.org/Product`
→ `POST /api/ingest/prices`. Sem Playwright, sem auth, custo zero.
Pasta `scrapers/` roda standalone via `tsx` — nunca importar no `app/`
(fora do bundle Next).

## Rodar local

```bash
npm i
# coleta real, sem enviar:
npx tsx scrapers/runner/run.ts --market fort --limit 5 --dry-run
# enviar p/ ingest local:
APP_URL=http://localhost:3000 CRON_SECRET=xxx npx tsx scrapers/runner/run.ts --market fort --limit 200
```

Flags: `--market fort|koch` (obrigatório), `--limit 1..2000` (default 200),
`--dry-run` (coleta sem POST), `--concurrency 1..8` (default 4),
`--incremental` (só lastmod ≤ 72h; sem lastmod, fatia por `--skip`),
`--full` (ignora o filtro incremental), `--skip N` (offset p/ fatiar, default 0).

```bash
# diária incremental (fatia rotacionada por dia da semana, dia 1-6):
npx tsx scrapers/runner/run.ts --market fort --limit 500 --incremental --skip 500 --dry-run
# full semanal (domingo):
npx tsx scrapers/runner/run.ts --market fort --limit 500 --full --dry-run
```

Testes: `npx tsx --test scrapers/markets/osuper.test.ts`
(concorrência, cookie de loja, incremental/skip com mocks — sem rede).

## Envs

| Var | Onde | Uso |
|---|---|---|
| `APP_URL` | GH Secrets + shell | base do `POST /api/ingest/prices` |
| `CRON_SECRET` | GH Secrets + shell | `Authorization: Bearer` (nunca logar, nunca commitar) |

Exit codes: `0` ok; `1` qualidade (`products_found < 30%` da baseline ou erro > 50%);
`2` uso/env.

## Throttle / robots

- `robots.txt` do Fort/Koch permite `/produtos/` e `/categorias`, bloqueia `/busca`.
- Throttle default: 1 req / 2s por mercado (`throttleMs`), retry 2x com backoff 1s/2s.
- `User-Agent: MercadoRadar/1.0 +contato`. Cron 1x/dia 06:00 BRT (`cron '0 9 * * *'` UTC).
- Baseline do gate: seed 200 até haver mediana de 7 dias em `scrape_runs`
  (TODO em `runner/run.ts`: ler baseline real do Supabase).

## Lojas São José (Tarefa I1, 2026-09-24)

Loja principal = a que o scraper usa (cookie `st_<sufixo>` no request).
`SearchActiveStoresQuery` via POST direto retornou HTTP 500 vazio nos dois
(endpoints exigem a operação exata do bundle); storeIds descobertos via
`window.INITIAL_STATE.storeSlugs` na home + verificação por cookie
(`selectedStore.slug` + `fullAddress`), ver comentários em `markets/fort.ts`.

| Loja | slug → storeId | Status |
|---|---|---|
| Fort Kobrasol (R. Cassol 1199, SJ) | `kobrasol` → **1638** | principal Fort (`markets.fort`) |
| Fort Areias/Barreiros (BR-101 km 202, SJ) | `areias` → 1666 | documentada, não coletada |
| Fort "sao-jose" (slug inativo, recai no default) | `sao-jose` → 1659 | inativa — cookie recai em 1585 |
| Fort Balneário Camboriú (antiga) | `balneario-camboriu` → 1585 | substituída |
| Koch Palhoça (atende SJ) | `palhoca` → **1412** | principal Koch (`markets.koch`) |
| Koch Camboriú (antiga default) | `camboriu` → 1415 | substituída |

Koch não tem loja em São José (12 lojas: itajai 1407, itapema 1408,
penha 1409, navegantes 1410, florianopolis 1411, palhoca 1412,
saofrancisco 1413, gaspar 1414, camboriu 1415, blumenau 1416,
tijucas 1535, joinville 1815) — Palhoça faz fronteira com SJ.
Migration: `supabase/migrations/0004_sao-jose.sql` (updates por slug,
idempotentes; Koch fica `city='São José (atendida por Palhoça)'`).

## Paralelismo (Tarefa I1)

`--concurrency N` (1..8, default 4): N workers com disparos espaçados de
`throttleMs/N` via mutex de decolagem — agregado ~1 req/0,5s por host
(com throttleMs=2000). Throttle agregado e retry/backoff 1s/2s preservados;
`onProgress` thread-safe (event loop single-thread, `done++` atômico).
Estimativa 500 produtos: serial ~17 min → concurrency 4 ~4-5 min.

## Coleta incremental (Tarefa I1)

- Sitemaps Fort/Koch (2026-09-24) **NÃO têm `<lastmod>`** (só `loc`,
  `changefreq`, `priority`) — verificado com `grep -c lastmod = 0`.
- `--incremental`: se houver lastmod, coleta só URLs ≤ 72h + até `limit`;
  sem lastmod, fallback por `--skip`/`limit` (fatia rotacionada por dia da
  semana no workflow: `skip = dia*500 % 2000`, limit 500).
- `--full` (domingo): ignora o filtro, coleta tudo até `limit`.
- Se a Osuper adicionar `<lastmod>` ao sitemap, `selectEntries` passa a
  filtrar automaticamente (entradas sem lastmod são mantidas).

## Descobrir storeId de nova loja Osuper

1. Abra a home da loja no navegador, aba Network, filtre `graphql`.
2. Qualquer request `storefront/graphql` inclui `storeId` no payload/cookie
   (ex. Fort: cookie `st_334={"id":"1585",...}` = Balneário Camboriú).
3. Alternativa: no DevTools → Application → Cookies → `st_*`.
4. Introspection GraphQL é desabilitada — operações exatas vêm do bundle JS
   (chunks lazy) ou do tráfego; v1 não precisa (sitemap+JSON-LD bastam).
5. Registre em `scrapers/markets/<loja>.ts` com a evidência em comentário.

## Troubleshooting (Observabilidade)

- **JSON-LD sumiu / `jsonld_not_found` alto**: o front mudou o SSR. Inspecione
  1 página salva (`curl -A "MercadoRadar/1.0" <url> -o debug.html`), ajuste
  `extractJsonLdProduct` em `markets/jsonld.ts`, rode `--limit 5 --dry-run`.
- **`invalid_price`**: `offers.price` veio em formato novo — estenda `parsePrice`.
- **HTTP 4xx/5xx em massa**: possível bloqueio; confira robots, reduza ritmo
  (`throttleMs`), rode `--limit 5 --dry-run` antes do full.
- **Ingest 401**: `CRON_SECRET` local ≠ servidor. Ingest 429: rate-limit 30 req/min —
  batches de 100 já respeitam; não paralelize.
- Diagnóstico: `scrape_runs` + `scrape_errors` no Supabase (via API, run_id no stdout).
