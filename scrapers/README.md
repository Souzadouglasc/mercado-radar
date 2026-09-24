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
`--dry-run` (coleta sem POST).

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
