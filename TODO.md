# MercadoRadar — Backlog / Pendências (Ordered by Priority)

## Fase 3 — Dynamic GitHub Actions Matrix + Frontend Integration (CRITICAL PATH)

### 3.1 Dynamic GH Actions Matrix via `scrape_actions`
- [ ] Atualizar `.github/workflows/scrape-all.yml` para ler `scrape_actions` table (RPC `get_next_scrape_action`) em vez de matrix estática
- [ ] Job "dispatcher" que pega N ações pendentes → dispara jobs filhos ou processa inline
- [ ] RPC `complete_scrape_action` chamada ao final de cada action
- [ ] Permitir priorização: ofertas/encartes (Brasil/Komprao) > produtos regulares (Fort/Koch)
- [ ] Baseline dinâmica por mercado (armazenar em `markets.baseline_min_products`)

### 3.2 Frontend — Normalized Catalog Integration
- [ ] `/buscar` usar RPC `search_products_ft` (já existe) — verifica se já funciona
- [ ] `/categorias/[id]` mostrar comparison via `/api/categories/[id]/comparison` (API existe)
- [ ] `ProductCard` mostrar `unit_price` (R$/kg, R$/L, R$/un) — `lib/catalog/unit-price.ts` pronto
- [ ] Página `/produtos/[slug]` agregar preços de todos os mercados via `latest_prices_for_products`
- [ ] Remover dependência de `products.category_id` (maioria NULL) — usar `canonical_products.category_id`

### 3.3 Templates & Listas UI
- [ ] Página `/listas` listar templates do usuário + "Criar do template"
- [ ] Página `/listas/[id]` edição drag-drop, marcar comprado, ver preço atual por mercado
- [ ] Botão "Comparar preços desta lista" → redirect para `/comparar?list=<id>`
- [ ] Compartilhamento de lista (link público read-only)

---

## Fase 4 — Alertas & Scrape Actions Avançados

### 4.1 Price Alerts Engine
- [ ] Cron job (GitHub Actions ou Supabase pg_cron) que roda a cada 30min:
  - Query `price_alerts` ativos → `latest_prices_for_products` → avalia regra (`below` | `drop_pct`)
  - Se dispara: cria notificação (email/push) + marca `last_triggered_at`
- [ ] UI `/alertas`: criar/editar/deletar alertas por produto (search autocomplete em canonical_products)
- [ ] Regra "avisa quando cair X%" + "avisa quando abaixo de R$ Y"
- [ ] Unsubscribe via link no email

### 4.2 Scrape Actions Inteligentes
- [ ] Popular `scrape_actions` via:
  - Sitemap diff (novas URLs) → priority alta
  - Produtos sem preço há > 72h → priority média
  - Alertas ativos sem preço recente → priority máxima
  - Encartes Brasil/Komprao (diário) → priority alta
- [ ] Worker que processa `scrape_actions` em lote (concurrency controlado)
- [ ] Retry exponencial + dead-letter após 3 falhas

---

## Melhorias de Qualidade (Scrapers)

### Fort/Koch (Osuper)
- [ ] Verificar se sitemap contém **todos** produtos ou só subset
- [ ] Fallback: GraphQL `products(search: "")` paginado se sitemap incompleto
- [ ] Extrair `category` do JSON-LD (`product.category` ou breadcrumb) → popular `canonical_products.category_id`
- [ ] Tratar variantes (ex: mesma SKU, pesos diferentes) no catalog matching

### Brasil Atacadista (WordPress encartes)
- [ ] Ajustar `searchTerms`: testar `["encarte", "ofertas", "promocao", "tabloide"]`
- [ ] OCR placeholder → integrar Tesseract.js ou API OCR (Google Vision/AWS Textract) para extrair preços das imagens
- [ ] Parsing de preços do texto OCR (regex R$ XX,XX + nome produto)

### Komprão (WordPress ofertas)
- [ ] Confirmar que `postType: "oferta"` captura todas as cidades
- [ ] Extrair imagens do iframe Issuu (download PDF → render → OCR) — complexo, prioridade baixa
- [ ] Atualmente só cria 1 produto por cidade (título = cidade) — melhorar para extrair itens individuais do encarte

---

## Dados & Qualidade

- [ ] **Backfill `category_id`**: script que usa nome + brand para classificar canonical_products em categorias existentes
- [ ] **Deduplicação**: rodar `CatalogService.matchOrCreate` em lote nos 701 canonical_products existentes para merge duplicados (mesmo EAN, nomes similares)
- [ ] **Imagens**: verificar `products.image_url` populado — backfill onde NULL via última coleta válida
- [ ] **Preço por unidade**: validar `unit-price.ts` em todos os produtos — corrigir `quantity/unit` parsing onde falha

---

## Infra & DevOps

- [ ] **Supabase pg_cron** para price alerts evaluation (substituir GitHub Actions cron)
- [ ] **Monitoring**: GitHub Actions dashboard + alerta Slack/Telegram se `scrape_runs.status = FAILED` por 2 runs seguidos
- [ ] **Rate limiting**: respeitar `robots.txt` + `Retry-After` headers — já no BaseHttpProvider
- [ ] **Secrets rotation**: documentar rotação de `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`
- [ ] **Preview deploys**: Vercel preview para PRs + smoke test scrapers em PR

---

## Dívida Técnica / Limpeza

- [ ] Remover scrapers legados: `scrapers/markets/{osuper.ts,fort.ts,koch.ts,brasil.ts,komprao.ts,jsonld.ts}` — mantidos só para referência histórica
- [ ] Remover `scrapers/runner/run.ts` antigo (legacy) — já substituído
- [ ] Mover tipos compartilhados para `scrapers/core/types.ts` (ex: `NormalizedProduct`, `MarketMetadata`)
- [ ] Adicionar ESLint + Prettier no CI (atualmente só `tsc`)
- [ ] Documentar `AGENTS.md` com instruções atualizadas para novos agentes

---

## Nice-to-Have (Future)

- [ ] **App móvel** (PWA já funciona — add to home screen)
- [ ] **Histórico de preços gráfico** (Chart.js/Recharts na página do produto)
- [ ] **Lista "Rancho do Mês" auto** baseada em compras passadas do usuário
- [ ] **Integração IFTTT/Zapier** para alertas → Telegram/Email/Notion
- [ ] **Multi-região**: expandir store_ids para outras cidades SC (Florianópolis, Joinville, etc.)
- [ ] **API pública** (rate-limited) para terceiros consumirem preços

---

## Status Atual (2026-09-24)

| Componente | Status |
|------------|--------|
| Provider Pattern (core) | ✅ Completo |
| Osuper Provider (Fort/Koch) | ✅ Produção |
| WordPress Provider (Brasil/Komprao) | ✅ Produção |
| Catalog Normalizado (canonical_products) | ✅ 701 produtos migrados |
| Ingest Direto Supabase | ✅ Funcionando |
| Migrações 0008/0009 | ✅ Aplicadas |
| Testes (36 passing) | ✅ |
| Build Next.js | ✅ Clean |
| GitHub Actions scrape-all | ✅ Passing (4 markets) |
| Dynamic Matrix (scrape_actions) | ⏳ **Próximo** |
| Frontend Integration | ⏳ **Próximo** |
| Price Alerts Engine | ⏳ Fase 4 |
| OCR Encartes | ⏳ Fase 4 |

---

## Como Continuar (Ordem Recomendada)

1. **3.1** → Dynamic GH Actions matrix (desbloqueia escalabilidade)
2. **3.2** → Frontend normalized catalog (valor imediato para usuário)
3. **3.3** → Templates UI (diferencial do produto)
4. **4.1** → Price Alerts (retenção)
5. **4.2** → Scrape Actions inteligentes (eficiência)
6. Qualidade scrapers / Dados / Infra (contínuo)