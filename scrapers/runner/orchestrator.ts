/**
 * Orchestrator - MercadoRadar
 * Orquestra o pipeline completo: collect → normalize → catalog → ingest → alerts.
 * Substitui a lógica hardcoded do runner/run.ts antigo.
 */

import { providerRegistry, initializeRegistry } from "../registry/index.js";
import { ProductCatalog } from "../core/catalog.js";
import { IngestClient, type IngestItem } from "../core/ingest-client.js";
import type { MarketProvider, CollectOptions, CollectResult, NormalizedProduct } from "../core/provider.js";
import { getEnabledMarkets, getMarketConfig } from "../config/markets.config.js";

export interface OrchestratorOptions {
  /** Slugs dos mercados para processar (vazio = todos habilitados) */
  markets?: string[];
  /** Opções de coleta repassadas aos providers */
  collectOptions?: Partial<CollectOptions>;
  /** Se true, não envia para ingest (dry-run) */
  dryRun?: boolean;
  /** Callback de log/progresso */
  onLog?: (message: string) => void;
}

export interface OrchestratorResult {
  marketSlug: string;
  collectResult: CollectResult;
  ingestResult?: {
    valid: number;
    ignored: number;
    created: number;
    status: string;
    runId: string;
  };
  matchedProducts: Array<{
    productId: string;
    rawName: string;
    matchedBy: "ean" | "alias" | "canonical" | "new";
    isNew: boolean;
  }>;
  success: boolean;
  error?: string;
}

export class Orchestrator {
  private catalog: ProductCatalog;
  private ingestClient?: IngestClient;
  private options: Required<OrchestratorOptions>;
  private logs: string[] = [];

  constructor(
    private supabase: any, // SupabaseClient
    options: OrchestratorOptions = {}
  ) {
    this.catalog = new ProductCatalog(supabase);
    this.options = {
      markets: options.markets ?? [],
      collectOptions: options.collectOptions ?? {},
      dryRun: options.dryRun ?? false,
      onLog: options.onLog ?? ((msg) => console.log(msg)),
    };
  }

  private log(msg: string): void {
    this.logs.push(msg);
    this.options.onLog(msg);
  }

  /** Inicializa registry e ingest client */
  private async initialize(): Promise<void> {
    initializeRegistry(this.options.markets.length > 0 
      ? this.options.markets.map(s => getMarketConfig(s)!).filter(Boolean)
      : getEnabledMarkets()
    );

    if (!this.options.dryRun) {
      this.ingestClient = new IngestClient();
    }
  }

  /** Executa pipeline para um mercado */
  async runMarket(marketSlug: string): Promise<OrchestratorResult> {
    const provider = providerRegistry.get(marketSlug);
    if (!provider) {
      return {
        marketSlug,
        collectResult: { items: [], outcomes: [], stats: { marketSlug, productsFound: 0, ok: 0, errors: 0, errorRate: 0, durationMs: 0 }, startedAt: "", finishedAt: "" },
        matchedProducts: [],
        success: false,
        error: `Provider não encontrado: ${marketSlug}`,
      };
    }

    const marketConfig = getMarketConfig(marketSlug);
    const baseline = marketConfig?.baseline ?? { minProducts: 100, maxErrorRate: 0.5 };

    this.log(`[${marketSlug}] Iniciando coleta...`);

    // 1. Coleta
    const collectOptions: CollectOptions = {
      limit: this.options.collectOptions.limit ?? 200,
      incremental: this.options.collectOptions.incremental ?? false,
      full: this.options.collectOptions.full ?? false,
      skip: this.options.collectOptions.skip ?? 0,
      concurrency: this.options.collectOptions.concurrency ?? 4,
      throttleMs: this.options.collectOptions.throttleMs ?? 2000,
      retries: this.options.collectOptions.retries ?? 2,
      actionIds: this.options.collectOptions.actionIds ?? [],
      actionUrls: this.options.collectOptions.actionUrls ?? [],
      onProgress: (done, total, url) => {
        if (done % 25 === 0 || done === total) {
          this.log(`[${marketSlug}] ${done}/${total} ${url}`);
        }
      },
      nowMs: this.options.collectOptions.nowMs,
    };

    let collectResult: CollectResult;
    try {
      collectResult = await provider.collect(collectOptions);
    } catch (err) {
      return {
        marketSlug,
        collectResult: { items: [], outcomes: [], stats: { marketSlug, productsFound: 0, ok: 0, errors: 0, errorRate: 1, durationMs: 0 }, startedAt: "", finishedAt: "" },
        matchedProducts: [],
        success: false,
        error: `Coleta falhou: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    this.log(`[${marketSlug}] Coleta finalizada: ${collectResult.items.length} produtos, ${collectResult.stats.errors} erros (${(collectResult.stats.errorRate * 100).toFixed(1)}%)`);

    // Complete scrape_actions se dynamic matrix
    if (!this.options.dryRun && collectOptions.actionIds && collectOptions.actionIds.length > 0) {
      for (const actionId of collectOptions.actionIds) {
        if (actionId) {
          try {
            await this.supabase.rpc("complete_scrape_action", {
              p_action_id: actionId,
              p_status: "done",
              p_error_summary: null,
            });
            this.log(`[${marketSlug}] Action ${actionId} marcada como done`);
          } catch (err) {
            this.log(`[${marketSlug}] Erro ao completar action ${actionId}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }

    // Quality gates (apenas para providers com baseline)
    const belowBaseline = collectResult.items.length < 0.3 * Math.min(baseline.minProducts, collectOptions.limit);
    if (belowBaseline) {
      this.log(`[${marketSlug}] AVISO: products_found=${collectResult.items.length} < 30% da baseline (${Math.min(baseline.minProducts, collectOptions.limit)})`);
    }
    if (collectResult.stats.errorRate > baseline.maxErrorRate) {
      this.log(`[${marketSlug}] AVISO: taxa de erro=${(collectResult.stats.errorRate * 100).toFixed(1)}% > ${(baseline.maxErrorRate * 100).toFixed(0)}%`);
    }

    // 2. Catalog match/criação + prepara itens para ingest
    const matchedProducts: OrchestratorResult["matchedProducts"] = [];
    const ingestItems: IngestItem[] = [];

    for (const normalized of collectResult.items) {
      try {
        const ref = await this.catalog.matchOrCreate({
          canonicalName: normalized.canonicalName,
          brand: normalized.brand,
          barcode: normalized.barcode,
          marketSku: normalized.marketSku,
          quantity: normalized.quantity,
          unit: normalized.unit,
          normalizedQuantity: normalized.normalizedQuantity,
          normalizedUnit: normalized.normalizedUnit,
          imageUrl: normalized.imageUrl,
          categoryHint: normalized.categoryHint,
          marketSlug: normalized.marketSlug,
          rawName: normalized.rawName,
          collectedAt: normalized.collectedAt,
        });

        matchedProducts.push({
          productId: ref.productId,
          rawName: normalized.rawName,
          matchedBy: ref.matchedBy,
          isNew: ref.isNew,
        });

        // Prepara item para ingest (usa nome original para alias matching + canonical_product_id)
        ingestItems.push(IngestClient.toIngestItem(normalized, ref.productId));
      } catch (err) {
        this.log(`[${marketSlug}] Erro no catalog para "${normalized.rawName}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this.log(`[${marketSlug}] Catalog: ${matchedProducts.filter(m => m.isNew).length} novos, ${matchedProducts.filter(m => !m.isNew).length} existentes`);

    // 3. Ingest (se não dry-run)
    let ingestResult: OrchestratorResult["ingestResult"];
    if (!this.options.dryRun && this.ingestClient && ingestItems.length > 0) {
      this.log(`[${marketSlug}] Enviando ${ingestItems.length} itens para ingest...`);
      try {
        const result = await this.ingestClient.ingestBatch(ingestItems);
        ingestResult = {
          valid: result.valid,
          ignored: result.ignored,
          created: result.created,
          status: result.status,
          runId: result.run_id,
        };
        this.log(`[${marketSlug}] Ingest: ${result.valid} válidos, ${result.ignored} ignorados, ${result.created} criados (${result.status})`);
      } catch (err) {
        this.log(`[${marketSlug}] Ingest falhou: ${err instanceof Error ? err.message : String(err)}`);
        ingestResult = { valid: 0, ignored: ingestItems.length, created: 0, status: "FAILED", runId: "" };
      }
    } else {
      ingestResult = { valid: 0, ignored: 0, created: 0, status: "DRY_RUN", runId: "" };
      this.log(`[${marketSlug}] DRY_RUN — ingest não executado`);
    }

    return {
      marketSlug,
      collectResult,
      ingestResult,
      matchedProducts,
      success: true,
    };
  }

  /** Executa pipeline para todos os mercados configurados */
  async runAll(): Promise<OrchestratorResult[]> {
    await this.initialize();

    const targetMarkets = this.options.markets.length > 0
      ? this.options.markets
      : providerRegistry.getSlugs();

    this.log(`[Orchestrator] Iniciando para mercados: ${targetMarkets.join(", ")}`);

    const results: OrchestratorResult[] = [];

    for (const marketSlug of targetMarkets) {
      const result = await this.runMarket(marketSlug);
      results.push(result);
      
      if (!result.success) {
        this.log(`[${marketSlug}] FALHOU: ${result.error}`);
      }
    }

    // Summary
    const totalCollected = results.reduce((sum, r) => sum + r.collectResult.items.length, 0);
    const totalValid = results.reduce((sum, r) => sum + (r.ingestResult?.valid ?? 0), 0);
    const totalNew = results.reduce((sum, r) => sum + r.matchedProducts.filter(m => m.isNew).length, 0);
    const failed = results.filter(r => !r.success).length;

    this.log(`[Orchestrator] FINAL: ${totalCollected} coletados, ${totalValid} válidos, ${totalNew} novos produtos, ${failed} falharam`);

    return results;
  }

  /** Retorna logs acumulados */
  getLogs(): string[] {
    return this.logs;
  }
}

/** Factory para criar orchestrator com supabase service_role */
export async function createOrchestrator(options: OrchestratorOptions = {}): Promise<Orchestrator> {
  const { createServiceRoleClient } = await import("../lib/supabase.js");
  const supabase = createServiceRoleClient();
  return new Orchestrator(supabase, options);
}