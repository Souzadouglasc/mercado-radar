/**
 * Osuper Provider - MercadoRadar
 * Provider para mercados na plataforma Osuper (Fort, Koch).
 * Estratégia v1: sitemap.xml → HTML /produtos/* → JSON-LD schema.org/Product
 */

import { BaseHttpProvider } from "../../providers/base-http-provider.js";
import {
  type CollectOptions,
  type CollectResult,
  type MarketMetadata,
  type NormalizedProduct,
  type RawProduct,
  type UrlOutcome,
  type RunStats,
} from "../../provider.js";
import { parseSitemapEntries, selectEntries, type SitemapEntry } from "../../sitemap.js";
import { extractJsonLdProduct, toProductPrice, type JsonLdProduct, type ToProductPriceInput } from "../../jsonld.js";

export interface OsuperProviderConfig {
  /** Slug em markets.slug (ex.: "fort") */
  marketSlug: string;
  /** URL base da loja (ex.: https://fortatacadista.com.br) */
  siteUrl: string;
  /** Endpoint GraphQL Osuper (v1: não usado na coleta; documentado p/ uso futuro) */
  apiUrl: string;
  /** storeId Osuper — enviado como cookie `st_<cookieSuffix>` p/ preço da loja certa */
  storeId: string;
  /** Sufixo do cookie de loja Osuper (ex. Fort "334" → `st_334`) */
  cookieSuffix?: string;
  /** Cidade atendida */
  city?: string;
  [key: string]: unknown;
}

const INCREMENTAL_MAX_AGE_MS = 72 * 3600 * 1000; // 72h

export class OsuperProvider extends BaseHttpProvider {
  private readonly osuperConfig: OsuperProviderConfig;

  constructor(config: OsuperProviderConfig) {
    const metadata: MarketMetadata = {
      slug: config.marketSlug,
      name: config.marketSlug.charAt(0).toUpperCase() + config.marketSlug.slice(1),
      providerType: "osuper",
      city: config.city,
      siteUrl: config.siteUrl,
    };

    super(config.marketSlug, metadata, config, {
      defaultThrottleMs: 2000,
      defaultConcurrency: 4,
      defaultRetries: 2,
    });

    this.osuperConfig = config;
  }

  protected getExtraHeaders(): Record<string, string> | undefined {
    // Cookie de loja Osuper: st_<suffix>={"id":"<storeId>"}
    if (this.osuperConfig.cookieSuffix != null && /^\d+$/.test(this.osuperConfig.storeId)) {
      return {
        Cookie: `st_${this.osuperConfig.cookieSuffix}={"id":"${this.osuperConfig.storeId}"}`,
      };
    }
    return undefined;
  }

  async collect(options: CollectOptions): Promise<CollectResult> {
    const startedAt = new Date().toISOString();
    const limit = options.limit ?? 200;
    const throttleMs = options.throttleMs ?? this.defaultThrottleMs;
    const retries = options.retries ?? this.defaultRetries;
    const concurrency = Math.min(
      8,
      Math.max(1, Math.floor(options.concurrency ?? this.defaultConcurrency))
    );
    const skip = Math.max(0, Math.floor(options.skip ?? 0));
    const incremental = (options.incremental ?? false) && !options.full;

    let urls: string[];
    let actionIds: string[] = [];

    // Dynamic matrix mode: usar URLs específicas das scrape_actions
    if (options.actionUrls && options.actionUrls.length > 0) {
      urls = options.actionUrls;
      actionIds = options.actionIds || [];
      console.log(`[${this.slug}] Dynamic matrix mode: ${urls.length} URLs from scrape_actions`);
    } else {
      // Modo tradicional: sitemap
      const xml = await this.fetchText(
        `${this.osuperConfig.siteUrl.replace(/\/$/, "")}/sitemap.xml`,
        retries
      );

      const { selected, hasLastmod, total } = selectEntries(parseSitemapEntries(xml), {
        limit,
        skip,
        incremental,
        full: options.full,
        nowMs: options.nowMs,
      });

      urls = selected.map((e) => e.url);

      if (incremental && !hasLastmod) {
        console.log(
          `[${this.slug}] sitemap sem <lastmod> (total=${total}) — fallback por skip=${skip} limit=${limit}`
        );
      }
    }

    // 3. Headers com cookie de loja
    const headers = this.getExtraHeaders();

    // 4. Coleta paralela com throttle
    const results = await this.parallelWithThrottle<NormalizedProduct | null>(
      urls,
      async (url, index) => {
        const collectedAt = new Date().toISOString();
        try {
          const html = await this.fetchText(url, retries, headers);
          const jsonld = extractJsonLdProduct(html);
          if (!jsonld) {
            return null;
          }
          const item = toProductPrice({
            jsonld,
            marketSlug: this.slug,
            sourceUrl: url,
            collectedAt,
          });
          if (!item) return null;

          // Converte ProductPrice (contrato ingest) → NormalizedProduct
          return this.productPriceToNormalized(item, jsonld);
        } catch (err) {
          return null;
        }
      },
      { concurrency, throttleMs, onProgress: options.onProgress }
    );

    // 5. Filtra sucessos e constrói outcomes
    const items: NormalizedProduct[] = [];
    const outcomes: UrlOutcome[] = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const normalized = results[i];
      if (normalized) {
        items.push(normalized);
        outcomes.push({ url, ok: true });
      } else {
        outcomes.push({
          url,
          ok: false,
          error: results[i] === null ? "jsonld_not_found_or_invalid_price" : "unknown_error",
        });
      }
    }

    const finishedAt = new Date().toISOString();
    const stats = this.toRunStats({ items, outcomes, startedAt, finishedAt } as CollectResult);

    // Se dynamic matrix, adicionar action_ids aos outcomes para complete_scrape_action
    if (actionIds.length > 0) {
      for (let i = 0; i < outcomes.length; i++) {
        if (actionIds[i]) {
          (outcomes[i] as any).action_id = actionIds[i];
        }
      }
    }

    return {
      items,
      outcomes,
      stats,
      startedAt,
      finishedAt,
    };
  }

  /** Converte ProductPrice (ingest) → NormalizedProduct (catálogo) */
  private productPriceToNormalized(
    item: NonNullable<ReturnType<typeof toProductPrice>>,
    jsonld: JsonLdProduct
  ): NormalizedProduct {
    const baseUnit = this.normalizeUnit(item.unit);
    const baseQty = this.toBaseQuantity(item.quantity, item.unit);

    return {
      canonicalName: item.product_name, // será re-normalizado no catalog
      brand: item.brand,
      barcode: item.barcode,
      marketSku: jsonld.sku ?? null,
      quantity: item.quantity,
      unit: item.unit,
      normalizedQuantity: baseQty,
      normalizedUnit: baseUnit,
      price: item.price,
      promotionalPrice: item.promotional_price,
      imageUrl: item.image_url,
      sourceUrl: item.source_url,
      source: item.source,
      collectedAt: item.collected_at,
      marketSlug: item.market_slug,
      rawName: item.product_name,
      categoryHint: null,
    };
  }

  getConfigSnapshot(): Record<string, unknown> {
    return {
      marketSlug: this.osuperConfig.marketSlug,
      siteUrl: this.osuperConfig.siteUrl,
      apiUrl: this.osuperConfig.apiUrl,
      storeId: this.osuperConfig.storeId,
      cookieSuffix: this.osuperConfig.cookieSuffix,
      city: this.osuperConfig.city,
    };
  }
}