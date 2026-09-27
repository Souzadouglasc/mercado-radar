# Coleta de preços

Os scrapers são executados fora do bundle Next.js via `tsx`. O pipeline é:

1. descobrir páginas no sitemap Osuper ou no endpoint REST WordPress;
2. extrair produtos e preços publicados em JSON-LD `schema.org/Product`;
3. normalizar, associar ao catálogo e gravar preço/histórico no Supabase.

Preço só é considerado válido quando a fonte publica um valor numérico maior
que zero. Páginas de encarte sem produtos/preços estruturados são registradas
como coleta sem preço; não são convertidas em produtos fictícios. Não há OCR
de imagem/PDF nem integração autenticada de catálogo neste provider.

## Executar

```bash
npx tsx scrapers/runner/run.ts --market fort --limit 5 --dry-run
npx tsx scrapers/runner/run.ts --market koch --limit 200 --full
npx tsx scrapers/runner/run.ts --market brasil --limit 50 --dry-run
npx tsx scrapers/runner/run.ts --market komprao --limit 50 --dry-run
```

`--market` aceita `fort`, `koch`, `brasil` ou `komprao`. `--limit` aceita
1–2000 (default 200); `--concurrency` aceita 1–8 (default 4). Use
`--incremental` e `--skip N` para percorrer sitemaps sem `lastmod`, ou
`--full` para ignorar o filtro incremental. Execuções reais precisam de
`NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no ambiente.

## Cobertura atual por fonte

| Mercado | Método | Limite conhecido |
|---|---|---|
| Fort | Sitemap de produtos + JSON-LD | Preços expostos na página pública da loja selecionada pelo cookie Osuper. |
| Koch | Sitemap de produtos + JSON-LD | Preços expostos na página pública da loja selecionada pelo cookie Osuper. |
| Brasil Atacadista | WordPress REST + JSON-LD | O provider atual não lê preços embutidos em imagens/PDF de encarte. |
| Komprão | WordPress REST + JSON-LD | O provider atual não lê preços embutidos em imagens/encartes. |
| Bistek - Florianópolis (Ilha) | Catálogo público VTEX | Coleta SKU, preço, promoção, EAN e imagem; pagina por categoria. |
| Angeloni - Beira-Mar | Catálogo público VTEX | Coleta SKU, preço, promoção, EAN e imagem; pagina por categoria. |

O catálogo público VTEX limita cada consulta a 2.500 resultados. Para cobrir
catálogos maiores, o provider percorre as categorias e avança o offset entre
execuções diárias; o preço observado segue a loja padrão pública de cada site.

Na consulta de 2026-09-27, o banco tinha 1.633 preços recentes, todos de Fort
e Koch; não havia coleta automática pública de preços de Brasil Atacadista nem
Komprão nos últimos sete dias (há um registro manual do Brasil). As ofertas
publicadas apenas em encarte exigem OCR com validação de
produto/valor, ou uma API oficial de catálogo/preços, para completar essa
cobertura. O scraper não deve inferir esses valores.

## Fila e observabilidade

O workflow `scrape-all.yml` usa ações em `scrape_actions`; o dispatcher
recoloca na fila ações `running` sem atualização há mais de 45 minutos. Uma
ação só termina depois da tentativa de ingestão. Falhas de coleta, ausência de
preço válido ou falha de ingestão ficam como `failed`, com resumo. Os registros
`scrape_runs` passam a incluir `market_id` quando a execução contém um único
mercado.

Fort e Koch têm workflows manuais individuais. Os cron desses workflows foram
removidos para evitar que disputem requisições com o agendamento geral.
Observe `scrape_runs`, `scrape_errors`, `scrape_actions` e a contagem de preços
por mercado para conferir a execução real.

## Verificação

```bash
npm test
npx tsc --noEmit
npm run lint
```

`npm test` usa os testes em `scrapers/markets/` e `scrapers/core/normalize.test.ts`.

