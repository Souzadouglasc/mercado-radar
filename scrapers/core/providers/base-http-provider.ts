/**
 * Base HTTP Provider - MercadoRadar
 * Classe base com throttle, retry, concorrência, mutex de decolagem, User-Agent.
 * Providers concretos (Osuper, WordPress) herdam e implementam collect().
 */

import {
  type CollectOptions,
  type CollectResult,
  type MarketProvider,
  type MarketMetadata,
  type NormalizedProduct,
  type RawProduct,
  type UrlOutcome,
  type RunStats,
} from "../provider.js";
import type { ScrapeResult } from "../types.js";

const DEFAULT_USER_AGENT = "MercadoRadar/1.0 +contato";
const DEFAULT_THROTTLE_MS = 2000;
const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 8;
const DEFAULT_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Classe base para providers HTTP.
 * Gerencia: throttle agregado, retry com backoff, concorrência controlada,
 * User-Agent, timeout, logging de erros.
 */
export abstract class BaseHttpProvider<TConfig extends Record<string, unknown> = Record<string, unknown>> implements MarketProvider {
  public readonly slug: string;
  public readonly metadata: MarketMetadata;
  public readonly config: TConfig;

  protected readonly userAgent: string;
  protected readonly defaultThrottleMs: number;
  protected readonly defaultConcurrency: number;
  protected readonly defaultRetries: number;

  constructor(
    slug: string,
    metadata: MarketMetadata,
    config: TConfig,
    options: {
      userAgent?: string;
      defaultThrottleMs?: number;
      defaultConcurrency?: number;
      defaultRetries?: number;
    } = {}
  ) {
    this.slug = slug;
    this.metadata = metadata;
    this.config = config;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.defaultThrottleMs = options.defaultThrottleMs ?? DEFAULT_THROTTLE_MS;
    this.defaultConcurrency = options.defaultConcurrency ?? DEFAULT_CONCURRENCY;
    this.defaultRetries = options.defaultRetries ?? DEFAULT_RETRIES;
  }

  /** Headers extras por provider (ex.: cookie de loja Osuper) */
  protected abstract getExtraHeaders(): Record<string, string> | undefined;

  /** Implementação concreta da coleta */
  abstract collect(options: CollectOptions): Promise<CollectResult>;

  /** Validação básica de item bruto */
  validateItem(item: RawProduct): boolean {
    return (
      typeof item.name === "string" &&
      item.name.trim().length > 0 &&
      typeof item.price === "number" &&
      item.price > 0 &&
      typeof item.sourceUrl === "string" &&
      item.sourceUrl.startsWith("http")
    );
  }

  /** Normaliza RawProduct → NormalizedProduct (pode ser sobrescrito) */
  protected async normalizeItem(raw: RawProduct): Promise<NormalizedProduct> {
    const { normalizeName, parsePrice } = await import("../normalize.js");
    const parsed = normalizeName(raw.name);

    // Normaliza unidade para base (kg, L, un)
    const baseUnit = this.normalizeUnit(raw.unit);
    const baseQty = this.toBaseQuantity(raw.quantity, raw.unit);

    return {
      canonicalName: parsed.canonical,
      brand: raw.brand ?? null,
      barcode: raw.barcode ?? null,
      marketSku: raw.sku ?? null,
      quantity: raw.quantity ?? null,
      unit: raw.unit ?? null,
      normalizedQuantity: baseQty,
      normalizedUnit: baseUnit,
      price: raw.price,
      promotionalPrice: raw.promotionalPrice ?? null,
      imageUrl: raw.imageUrl ?? null,
      sourceUrl: raw.sourceUrl,
      source: raw.source,
      collectedAt: raw.collectedAt,
      marketSlug: raw.marketSlug,
      rawName: raw.name,
      categoryHint: raw.extras?.categoryHint as string | null ?? null,
    };
  }

  /** Normaliza unidade para base: kg, L, un */
  protected normalizeUnit(unit: string | null | undefined): "kg" | "L" | "un" | null {
    if (!unit) return null;
    const u = unit.toLowerCase().trim();
    if (["g", "gr", "grama", "gramas", "kg", "quilograma", "quilogramas"].includes(u)) return "kg";
    if (["ml", "mililitro", "mililitros", "l", "litro", "litros"].includes(u)) return "L";
    if (["un", "unid", "unidade", "unidades", "pct", "peca", "peça", "pecas", "peças", "pc", "pcs", "cx", "caixa", "pacote", "pct", "dz", "dzia", "duzia", "dúzia"].includes(u)) return "un";
    return null;
  }

  /** Converte quantidade para unidade base */
  protected toBaseQuantity(quantity: number | null | undefined, unit: string | null | undefined): number | null {
    if (quantity === null || quantity === undefined || quantity <= 0) return null;
    const baseUnit = this.normalizeUnit(unit);
    if (!baseUnit) return null;

    const u = unit?.toLowerCase().trim() ?? "";

    if (baseUnit === "kg") {
      if (["g", "gr", "grama", "gramas"].includes(u)) return quantity / 1000;
      if (["kg", "quilograma", "quilogramas"].includes(u)) return quantity;
    }
    if (baseUnit === "L") {
      if (["ml", "mililitro", "mililitros"].includes(u)) return quantity / 1000;
      if (["l", "litro", "litros"].includes(u)) return quantity;
    }
    if (baseUnit === "un") {
      return quantity;
    }
    return null;
  }

  /** Configuração para snapshot em scrape_runs */
  getConfigSnapshot(): Record<string, unknown> {
    // Remove campos sensíveis se houver
    const { ...safe } = this.config;
    return safe;
  }

  // ==================== HTTP Helpers ====================

  /** Fetch com retry, backoff, timeout, headers padrão */
  protected async fetchText(
    url: string,
    retries: number = this.defaultRetries,
    extraHeaders?: Record<string, string>
  ): Promise<string> {
    let lastError: unknown = null;
    const headers = {
      "User-Agent": this.userAgent,
      Accept: "text/html,application/xhtml+xml",
      ...this.getExtraHeaders(),
      ...extraHeaders,
    };

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } catch (err) {
        lastError = err;
        if (attempt < retries) await sleep(1000 * 2 ** attempt); // 1s, 2s, 4s...
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /** Fetch JSON com retry */
  protected async fetchJson<T>(
    url: string,
    retries: number = this.defaultRetries,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    let lastError: unknown = null;
    const headers = {
      "User-Agent": this.userAgent,
      Accept: "application/json",
      ...this.getExtraHeaders(),
      ...extraHeaders,
    };

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as T;
      } catch (err) {
        lastError = err;
        if (attempt < retries) await sleep(1000 * 2 ** attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  // ==================== Concorrência + Throttle ====================

  /**
   * Executa workers paralelos com throttle agregado.
   * @param urls URLs para processar
   * @param workerFn Função assíncrona processando uma URL (recebe url, index)
   * @param options Opções de concorrência/throttle
   * @param onProgress Callback de progresso
   * @returns Array de resultados (null = erro, tratado pelo worker)
   */
  protected async parallelWithThrottle<T>(
    urls: string[],
    workerFn: (url: string, index: number) => Promise<T>,
    options: {
      concurrency: number;
      throttleMs: number;
      onProgress?: (done: number, total: number, url: string) => void;
    }
  ): Promise<(T | null)[]> {
    const concurrency = Math.min(MAX_CONCURRENCY, Math.max(1, Math.floor(options.concurrency)));
    const throttleMs = Math.max(100, Math.floor(options.throttleMs));
    const interval = throttleMs / concurrency;

    const results: (T | null)[] = new Array(urls.length).fill(null);
    let next = 0;
    let done = 0;
    let nextAllowed = 0;
    let takeoff = Promise.resolve();

    async function spacedStart(): Promise<void> {
      let release!: () => void;
      const prev = takeoff;
      takeoff = new Promise<void>((r) => (release = r));
      await prev;
      try {
        const wait = nextAllowed - Date.now();
        if (wait > 0) await sleep(wait);
        nextAllowed = Date.now() + interval;
      } finally {
        release();
      }
    }

    async function worker(): Promise<void> {
      for (;;) {
        const idx = next++;
        if (idx >= urls.length) return;
        const url = urls[idx];
        await spacedStart();
        try {
          results[idx] = await workerFn(url, idx);
        } catch {
          results[idx] = null;
        }
        done += 1;
        options.onProgress?.(done, urls.length, url);
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, urls.length) }, () => worker())
    );

    return results;
  }

  // ==================== Utilitários de Resultado ====================

  /** Converte CollectResult interno para ScrapeResult (compatibilidade runner legado) */
  protected toScrapeResult(result: CollectResult): ScrapeResult {
    return {
      marketSlug: this.slug,
      items: result.items.map((n) => this.normalizedToProductPrice(n)),
      outcomes: result.outcomes,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
    };
  }

  /** Converte NormalizedProduct para ProductPrice (contrato ingest) */
  protected normalizedToProductPrice(n: NormalizedProduct): {
    product_name: string;
    brand: string | null;
    barcode: string | null;
    unit: string | null;
    quantity: number | null;
    price: number;
    promotional_price: number | null;
    market_slug: string;
    source_url: string | null;
    source: "site-jsonld" | "graphql" | "manual" | "encarte";
    collected_at: string;
    image_url: string | null;
  } {
    return {
      product_name: n.rawName, // Usa nome original para alias matching
      brand: n.brand,
      barcode: n.barcode,
      unit: n.unit,
      quantity: n.quantity,
      price: n.price,
      promotional_price: n.promotionalPrice,
      market_slug: n.marketSlug,
      source_url: n.sourceUrl,
      source: n.source,
      collected_at: n.collectedAt,
      image_url: n.imageUrl,
    };
  }

  /** Gera RunStats a partir de CollectResult */
  protected toRunStats(result: CollectResult): RunStats {
    const ok = result.outcomes.filter((o: UrlOutcome) => o.ok).length;
    const errors = result.outcomes.length - ok;
    return {
      marketSlug: this.slug,
      productsFound: result.items.length,
      ok,
      errors,
      errorRate: result.outcomes.length ? errors / result.outcomes.length : 0,
      durationMs: Date.parse(result.finishedAt) - Date.parse(result.startedAt),
    };
  }
}