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
  type UrlOutcome,
} from "../../provider.js";
import { parseSitemapEntries, selectEntries } from "../../sitemap.js";
import { extractJsonLdProducts, toProductPrice, type JsonLdProduct } from "../../jsonld.js";

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

    // Dynamic matrix mode: usar URLs específicas das scrape_actions
    if (options.actionUrls && options.actionUrls.length > 0) {
      urls = options.actionUrls;
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
    const requestErrors: Array<string | undefined> = new Array(urls.length);
    const results = await this.parallelWithThrottle<NormalizedProduct[]>(
      urls,
      async (url, index) => {
        const collectedAt = new Date().toISOString();
        try {
          const html = await this.fetchText(url, retries, headers);
          const products = extractJsonLdProducts(html);
          if (products.length === 0) {
            requestErrors[index] = "jsonld_product_not_found";
            return [];
          }
          const normalized = products.flatMap((jsonld) => {
            const item = toProductPrice({ jsonld, marketSlug: this.slug, sourceUrl: url, collectedAt });
            return item ? [this.productPriceToNormalized(item, jsonld)] : [];
          });
          if (normalized.length === 0) requestErrors[index] = "jsonld_product_without_valid_price";
          return normalized;
        } catch (err) {
          requestErrors[index] = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
          return [];
        }
      },
      { concurrency, throttleMs, onProgress: options.onProgress }
    );

    // 5. Filtra sucessos e constrói outcomes
    const items: NormalizedProduct[] = [];
    const outcomes: UrlOutcome[] = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const normalized = results[i] ?? [];
      if (normalized.length > 0) {
        items.push(...normalized);
        outcomes.push({ url, ok: true });
      } else {
        outcomes.push({
          url,
          ok: false,
          error: requestErrors[i] ?? "request_failed",
        });
      }
    }

    const finishedAt = new Date().toISOString();
    const stats = this.toRunStats({ items, outcomes, startedAt, finishedAt } as CollectResult);

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
