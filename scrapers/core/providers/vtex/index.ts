/**
 * VTEX Catalog Provider.
 * Coleta preços e disponibilidade no catálogo público do próprio e-commerce.
 */

import { normalizeName, parsePrice } from "../../normalize.js";
import { extractJsonLdProducts } from "../../jsonld.js";
import { BaseHttpProvider } from "../../providers/base-http-provider.js";
import type {
  CollectOptions,
  CollectResult,
  MarketMetadata,
  NormalizedProduct,
  RawProduct,
  UrlOutcome,
} from "../../provider.js";

const MAX_CATALOG_RESULTS = 2500;

export interface VtexProviderConfig {
  marketSlug: string;
  siteUrl: string;
  catalogApiUrl: string;
  city?: string;
  pageSize?: number;
  salesChannel?: string;
  [key: string]: unknown;
}

interface VtexOffer {
  Price?: number | string;
  ListPrice?: number | string;
  PriceWithoutDiscount?: number | string;
  AvailableQuantity?: number;
}

interface VtexSeller {
  sellerId?: string;
  sellerDefault?: boolean;
  commertialOffer?: VtexOffer;
}

interface VtexImage {
  imageUrl?: string;
}

interface VtexItem {
  itemId?: string;
  name?: string;
  eans?: string[];
  images?: VtexImage[];
  sellers?: VtexSeller[];
}

interface VtexProduct {
  productId?: string;
  productName?: string;
  productNameComplete?: string;
  brand?: string;
  link?: string;
  linkText?: string;
  categories?: string[];
  items?: VtexItem[];
}

function finitePrice(...values: Array<number | string | undefined>): number | null {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : parsePrice(value);
    if (parsed != null && Number.isFinite(parsed) && parsed > 0) return Math.round(parsed * 100) / 100;
  }
  return null;
}

function productUrl(product: VtexProduct, siteUrl: string): string {
  const link = product.link?.trim();
  if (link) return new URL(link, siteUrl).toString();
  const linkText = product.linkText?.trim();
  if (linkText) return new URL(`/${encodeURIComponent(linkText)}/p`, siteUrl).toString();
  return siteUrl;
}

/** Mapeamento puro, exportado para validar os casos de catálogo sem acesso à rede. */
export function mapVtexProducts(
  products: VtexProduct[],
  input: { marketSlug: string; siteUrl: string; collectedAt: string },
): RawProduct[] {
  const mapped: RawProduct[] = [];
  const seen = new Set<string>();

  for (const product of products) {
    const name = (product.productNameComplete || product.productName || "").trim();
    if (!name) continue;

    for (const item of product.items ?? []) {
      const offers = (item.sellers ?? [])
        .filter((seller) => seller.commertialOffer)
        .sort((a, b) => Number(Boolean(b.sellerDefault)) - Number(Boolean(a.sellerDefault)));
      const seller = offers.find((entry) => (entry.commertialOffer?.AvailableQuantity ?? 1) > 0)
        ?? offers[0];
      const offer = seller?.commertialOffer;
      if (!offer || (offer.AvailableQuantity != null && offer.AvailableQuantity <= 0)) continue;

      const currentPrice = finitePrice(offer.Price, offer.PriceWithoutDiscount);
      if (currentPrice == null) continue;
      const listedPrice = finitePrice(offer.ListPrice, offer.PriceWithoutDiscount);
      const hasPromotion = listedPrice != null && listedPrice > currentPrice;
      const rawName = item.name && item.name !== name ? `${name} ${item.name}` : name;
      const sku = item.itemId?.trim() || product.productId?.trim() || null;
      const key = `${product.productId ?? product.linkText ?? name}:${sku ?? item.eans?.[0] ?? item.name ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);

      mapped.push({
        name: rawName,
        brand: product.brand?.trim() || null,
        barcode: item.eans?.find((ean) => /^\d{8,14}$/.test(ean)) ?? null,
        sku,
        ...normalizeName(rawName),
        price: hasPromotion ? listedPrice! : currentPrice,
        promotionalPrice: hasPromotion ? currentPrice : null,
        imageUrl: item.images?.find((image) => image.imageUrl)?.imageUrl ?? null,
        sourceUrl: productUrl(product, input.siteUrl),
        source: "catalog-api",
        collectedAt: input.collectedAt,
        marketSlug: input.marketSlug,
        extras: { categoryHint: product.categories?.[0]?.split("/").filter(Boolean).at(-1) ?? null },
      });
    }
  }

  return mapped;
}

export class VtexProvider extends BaseHttpProvider<VtexProviderConfig> {
  constructor(config: VtexProviderConfig) {
    const metadata: MarketMetadata = {
      slug: config.marketSlug,
      name: config.marketSlug.charAt(0).toUpperCase() + config.marketSlug.slice(1),
      providerType: "vtex",
      city: config.city,
      siteUrl: config.siteUrl,
    };
    super(config.marketSlug, metadata, config, {
      defaultThrottleMs: 2000,
      defaultConcurrency: 4,
      defaultRetries: 2,
    });
  }

  protected getExtraHeaders(): Record<string, string> {
    return { Accept: "application/json", "Accept-Language": "pt-BR,pt;q=0.9" };
  }

  async collect(options: CollectOptions): Promise<CollectResult> {
    const startedAt = new Date().toISOString();
    const finishedNow = () => new Date().toISOString();
    const limit = Math.max(1, Math.floor(options.limit ?? 200));
    const pageSize = Math.min(50, Math.max(1, Math.floor(this.config.pageSize ?? 50)));
    const throttleMs = options.throttleMs ?? this.defaultThrottleMs;
    const retries = options.retries ?? this.defaultRetries;
    const concurrency = Math.min(8, Math.max(1, Math.floor(options.concurrency ?? this.defaultConcurrency)));

    if (options.actionUrls?.length) {
      return this.collectProductPages(options, startedAt, concurrency, throttleMs, retries);
    }

    // A API pública de catálogo VTEX limita a janela de busca em 2.500 resultados.
    // O offset rotativo permite cobrir o catálogo por partes sem repetir sempre a primeira página.
    const startOffset = Math.max(0, Math.floor(options.skip ?? 0)) % MAX_CATALOG_RESULTS;
    const count = Math.min(limit, MAX_CATALOG_RESULTS);
    const ranges: Array<{ from: number; to: number; url: string }> = [];
    let collectedSlots = 0;
    while (collectedSlots < count) {
      const from = (startOffset + collectedSlots) % MAX_CATALOG_RESULTS;
      const pageCount = Math.min(pageSize, count - collectedSlots, MAX_CATALOG_RESULTS - from);
      const url = new URL(this.config.catalogApiUrl);
      url.searchParams.set("_from", String(from));
      url.searchParams.set("_to", String(from + pageCount - 1));
      if (this.config.salesChannel) url.searchParams.set("sc", this.config.salesChannel);
      ranges.push({ from, to: from + pageCount - 1, url: url.toString() });
      collectedSlots += pageCount;
    }

    const pageErrors: Array<string | undefined> = new Array(ranges.length);
    const pages = await this.parallelWithThrottle<VtexProduct[]>(
      ranges.map((range) => range.url),
      async (url, index) => {
        try {
          const products = await this.fetchJson<unknown>(url, retries);
          if (!Array.isArray(products)) throw new Error("vtex_catalog_response_not_array");
          return products as VtexProduct[];
        } catch (error) {
          pageErrors[index] = error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200);
          return [];
        }
      },
      { concurrency, throttleMs, onProgress: options.onProgress },
    );

    const items: NormalizedProduct[] = [];
    const outcomes: UrlOutcome[] = [];
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];
      const products = pages[i] ?? [];
      const rawItems = mapVtexProducts(products, {
        marketSlug: this.slug,
        siteUrl: this.config.siteUrl,
        collectedAt: finishedNow(),
      });
      for (const raw of rawItems) items.push(await this.normalizeItem(raw));

      const error = pageErrors[i];
      outcomes.push(error
        ? { url: range.url, ok: false, error }
        : rawItems.length
          ? { url: range.url, ok: true }
          : { url: range.url, ok: false, error: products.length ? "no_available_price_in_vtex_page" : "empty_vtex_catalog_page" });
    }

    const finishedAt = finishedNow();
    const result = { items, outcomes, startedAt, finishedAt } as CollectResult;
    return { ...result, stats: this.toRunStats(result) };
  }

  private async collectProductPages(
    options: CollectOptions,
    startedAt: string,
    concurrency: number,
    throttleMs: number,
    retries: number,
  ): Promise<CollectResult> {
    const urls = (options.actionUrls ?? []).slice(0, options.limit);
    const errors: Array<string | undefined> = new Array(urls.length);
    const pageItems = await this.parallelWithThrottle<NormalizedProduct[]>(
      urls,
      async (url, index) => {
        try {
          const html = await this.fetchText(url, retries);
          const collectedAt = new Date().toISOString();
          const products = extractJsonLdProducts(html);
          const normalized: NormalizedProduct[] = [];
          for (const jsonld of products) {
            const price = finitePrice(jsonld.offers?.price, jsonld.offers?.lowPrice);
            if (!price) continue;
            const raw: RawProduct = {
              name: jsonld.name,
              brand: jsonld.brand ?? null,
              barcode: null,
              sku: jsonld.sku ?? null,
              ...normalizeName(jsonld.name),
              price,
              imageUrl: jsonld.image ?? null,
              sourceUrl: url,
              source: "catalog-api",
              collectedAt,
              marketSlug: this.slug,
            };
            normalized.push(await this.normalizeItem(raw));
          }
          if (!normalized.length) errors[index] = "no_public_structured_product_price";
          return normalized;
        } catch (error) {
          errors[index] = error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200);
          return [];
        }
      },
      { concurrency, throttleMs, onProgress: options.onProgress },
    );

    const items = pageItems.flatMap((page) => page ?? []);
    const outcomes = urls.map((url, index) => ({ url, ok: (pageItems[index]?.length ?? 0) > 0, error: errors[index] }));
    const finishedAt = new Date().toISOString();
    const result = { items, outcomes, startedAt, finishedAt } as CollectResult;
    return { ...result, stats: this.toRunStats(result) };
  }
}

