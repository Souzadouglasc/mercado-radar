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

`--market` aceita `fort`, `koch`, `brasil`, `komprao`, `bistek` ou `angeloni`.
`--limit` aceita 1–2000 (default 200); `--concurrency` aceita 1–8 (default 4). Use
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

## Execução diária

O workflow `scrape-all.yml` mantém agendamentos diários às 06:00 BRT (seg–sáb)
e às 05:00 BRT no domingo. Cada mercado recebe uma varredura independente,
com limite de até 2.000 produtos por execução e concorrência controlada em 6.
O `--skip` avança em blocos de 2.000 para percorrer sitemaps e catálogos maiores
ao longo dos dias; o domingo faz uma varredura completa do segmento selecionado.
Para os catálogos VTEX, uma consulta individual ainda tem limite de 2.500 itens
por categoria. O limite diário não garante, sozinho, que sites maiores sejam
completamente cobertos em um único dia.

O pipeline resolve o catálogo e grava preços com até seis itens em paralelo,
mantendo concorrência máxima de seis no processamento HTTP e na ingestão. A
concorrência é limitada para reduzir o tempo sem disparar milhares de conexões
simultâneas aos mercados ou ao Supabase.

Na coleta real de 2026-09-27 foram gravados 2.052 preços do dia: Fort 477,
Koch 525, Bistek 525 e Angeloni 525. O total histórico passou a 3.685 preços.
O dry-run de 200 itens nos dois catálogos VTEX retornou 200 itens válidos em
cada um. Fort teve páginas sem preço estruturado; elas foram ignoradas em vez
de receber um preço inventado. Brasil Atacadista e Komprão retornaram zero
preços de produto nessa verificação.

Para cobrir os dois mercados que publicam ofertas em encartes, falta OCR com
validação de produto, preço, unidade e validade da oferta, ou acesso a uma API
oficial de catálogo/preços. O scraper não deve inferir valores de imagens sem
essa validação.

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
