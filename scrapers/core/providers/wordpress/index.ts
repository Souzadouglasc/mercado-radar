/**
 * WordPress Provider - MercadoRadar
 * Provider para mercados WordPress (Brasil Atacadista, Komprão).
 * Estratégia: wp-json REST API → busca páginas de oferta → lê JSON-LD Product com preço válido.
 * Imagens de encarte são identificadas, mas não viram preços sem OCR validado.
 */

import { BaseHttpProvider } from "../../providers/base-http-provider.js";
import {
  type CollectOptions,
  type CollectResult,
  type MarketMetadata,
  type NormalizedProduct,
  type UrlOutcome,
} from "../../provider.js";
import { extractJsonLdProducts, toProductPrice, type JsonLdProduct } from "../../jsonld.js";

export interface WordPressProviderConfig {
  /** Slug em markets.slug (ex.: "brasil", "komprao") */
  marketSlug: string;
  /** URL base do site */
  siteUrl: string;
  /** URL base do wp-json (ex.: https://site.com.br/wp-json) */
  wpJsonUrl: string;
  /** Termos de busca para encontrar encartes/ofertas */
  searchTerms: string[];
  /** Tipo de post: "post" (Brasil encartes) | "page" | "oferta" (Komprão ofertas) */
  postType: "post" | "page" | "oferta";
  /** Cidade para filtrar páginas (Komprão) */
  city?: string;
  /** Cidade atendida */
  cityAttended?: string;
  [key: string]: unknown;
}

interface WpPost {
  id: number;
  date: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  slug: string;
  yoast_head?: string;
  _embedded?: {
    "wp:featuredmedia"?: Array<{ source_url: string; media_details: { sizes: Record<string, { source_url: string }> } }>;
  };
}

interface WpSearchResult {
  id: number;
  title: string;
  url: string;
  date: string;
  images: string[];
  jsonLd: JsonLdProduct[];
}

interface WpActionPost {
  id: number;
  title: string | { rendered?: string };
  link?: string;
  url?: string;
  date?: string;
  content?: { rendered?: string };
  yoast_head?: string;
  _embedded?: WpPost["_embedded"];
}

export class WordPressProvider extends BaseHttpProvider<WordPressProviderConfig> {
  private readonly wpConfig: WordPressProviderConfig;

  constructor(config: WordPressProviderConfig) {
    const metadata: MarketMetadata = {
      slug: config.marketSlug,
      name: config.marketSlug.charAt(0).toUpperCase() + config.marketSlug.slice(1),
      providerType: "wordpress",
      city: config.cityAttended,
      siteUrl: config.siteUrl,
    };

    super(config.marketSlug, metadata, config, {
      defaultThrottleMs: 2000,
      defaultConcurrency: 1, // WP é sequencial (menos agressivo)
      defaultRetries: 2,
    });

    this.wpConfig = config;
  }

  protected getExtraHeaders(): Record<string, string> | undefined {
    return undefined; // WP não precisa de cookie especial
  }

  async collect(options: CollectOptions): Promise<CollectResult> {
    const startedAt = new Date().toISOString();
    const limit = options.limit ?? 50;
    const throttleMs = options.throttleMs ?? this.defaultThrottleMs;

    let searchResults: WpSearchResult[];

    // Dynamic matrix mode: usar URLs específicas das scrape_actions
    if (options.actionUrls && options.actionUrls.length > 0) {
      console.log(`[${this.slug}] Dynamic matrix mode: ${options.actionUrls.length} URLs from scrape_actions`);
      searchResults = await this.fetchActionUrls(options.actionUrls);
    } else {
      // Modo tradicional: busca encartes/ofertas
      searchResults = await this.searchEncartes(limit);
    }

    // A page only becomes a product when it publishes a structured, valid price.
    // Some WordPress themes inject JSON-LD into the rendered page rather than
    // the REST payload's content field, so fetch that page as a fallback.
    const items: NormalizedProduct[] = [];
    const outcomes: UrlOutcome[] = [];

    for (let i = 0; i < searchResults.length; i++) {
      const sr = searchResults[i];
      await this.sleep(throttleMs); // throttle sequencial
      try {
        let jsonLd = sr.jsonLd;
        const sourceHost = new URL(sr.url).hostname.replace(/^www\./i, "");
        const marketHost = new URL(this.wpConfig.siteUrl).hostname.replace(/^www\./i, "");
        if (!jsonLd.length && sourceHost === marketHost) {
          try {
            const html = await this.fetchText(sr.url, options.retries ?? this.defaultRetries);
            jsonLd = extractJsonLdProducts(html);
          } catch (err) {
            outcomes.push({
              url: sr.url,
              ok: false,
              error: `product_page_fetch_failed: ${err instanceof Error ? err.message.slice(0, 160) : String(err).slice(0, 160)}`,
            });
            continue;
          }
        }

        const products = jsonLd
          .map((jsonld) => toProductPrice({ jsonld, marketSlug: this.slug, sourceUrl: sr.url, collectedAt: new Date().toISOString() }))
          .filter((product): product is NonNullable<typeof product> => product !== null);
        if (products.length === 0) {
          outcomes.push({ url: sr.url, ok: false, error: "no_public_structured_product_price" });
          continue;
        }
        for (const product of products) {
          items.push(this.productPriceToNormalized(product, sr.images[0] ?? null));
        }
        outcomes.push({ url: sr.url, ok: true });
      } catch (err) {
        outcomes.push({
          url: sr.url,
          ok: false,
          error: err instanceof Error ? err.message.slice(0, 200) : String(err),
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

  /** Busca URLs específicas das scrape_actions */
  private async fetchActionUrls(urls: string[]): Promise<WpSearchResult[]> {
    const results: WpSearchResult[] = [];

    for (const url of urls) {
      try {
        // Detectar tipo de post pela URL
        let postUrl: string;
        if (url.includes("/oferta/") || url.includes("/ofertas/")) {
          // Extrair slug da URL e buscar no endpoint ofertas
          const slugMatch = url.match(/\/oferta\/([^/]+)\/?/);
          if (slugMatch) {
            postUrl = `${this.wpConfig.wpJsonUrl}/wp/v2/oferta?slug=${slugMatch[1]}`;
          } else {
            postUrl = `${this.wpConfig.wpJsonUrl}/wp/v2/oferta?search=${encodeURIComponent(url)}`;
          }
        } else {
          // Post/page padrão
          postUrl = `${this.wpConfig.wpJsonUrl}/wp/v2/search?search=${encodeURIComponent(url)}&per_page=1`;
        }

        const data = await this.fetchJson<WpActionPost[]>(postUrl);
        if (data.length > 0) {
          const post = data[0];
          const images: string[] = [];
          if (post._embedded?.["wp:featuredmedia"]?.[0]) {
            const media = post._embedded["wp:featuredmedia"][0];
            images.push(media.source_url);
            for (const sz of Object.values(media.media_details.sizes) as Array<{ source_url: string }>) {
              images.push(sz.source_url);
            }
          }
          const imgMatches = post.content?.rendered?.match(/src=["']([^"']+)["']/g);
          if (imgMatches) {
            for (const m of imgMatches) {
              const u = m.replace(/src=["']/, "").replace(/["']/, "");
              if (u.match(/\.(jpe?g|png|webp)$/i)) images.push(u);
            }
          }
          if (post.yoast_head && images.length === 0) {
            const ogMatch = post.yoast_head.match(/og:image["']?\s*content=["']([^"']+)["']/i);
            if (ogMatch) images.push(ogMatch[1]);
          }

          results.push({
            id: post.id,
            title: typeof post.title === "string" ? post.title : post.title?.rendered ?? "Oferta",
            url: post.link ?? post.url ?? url,
            date: post.date ?? new Date().toISOString(),
            images: [...new Set(images)],
            jsonLd: extractJsonLdProducts(post.content?.rendered ?? ""),
          });
        } else {
          results.push({
            id: -1,
            title: "Oferta",
            url,
            date: new Date().toISOString(),
            images: [],
            jsonLd: [],
          });
        }
      } catch (err) {
        console.error(`[${this.slug}] Erro ao buscar action URL ${url}:`, err);
        results.push({
          id: -1,
          title: "Oferta",
          url,
          date: new Date().toISOString(),
          images: [],
          jsonLd: [],
        });
      }
    }

    return results;
  }

  /** Busca encartes/ofertas via wp-json search */
  private async searchEncartes(limit: number): Promise<WpSearchResult[]> {
    // Para Komprão (postType='oferta'), buscar direto no endpoint de ofertas
    // pois o /search não encontra os custom post types corretamente
    if (this.wpConfig.postType === "oferta") {
      return this.searchOfertas(limit);
    }

    const results: WpSearchResult[] = [];
    const seenPostIds = new Set<number>();

    for (const term of this.wpConfig.searchTerms) {
      if (results.length >= limit) break;

      const searchUrl = `${this.wpConfig.wpJsonUrl}/wp/v2/search?search=${encodeURIComponent(term)}&per_page=${limit}&subtype=${this.wpConfig.postType}`;
      const searchResults = await this.fetchJson<Array<{
        id: number;
        title: string;
        url: string;
        type: string;
        subtype: string;
      }>>(searchUrl);

      for (const sr of searchResults) {
        if (results.length >= limit) break;
        if (seenPostIds.has(sr.id)) continue;

        // Fetch full post/page with _embed to get featured media
        const postUrl = `${this.wpConfig.wpJsonUrl}/wp/v2/${this.wpConfig.postType}s/${sr.id}?_embed`;
        const post = await this.fetchJson<WpPost>(postUrl);
        seenPostIds.add(post.id);

        // Filtro por cidade (Komprão)
        if (this.wpConfig.city && this.wpConfig.postType === "page") {
          const slugMatch = post.slug?.includes(this.wpConfig.city);
          const titleMatch = post.title.rendered.toLowerCase().includes(this.wpConfig.city.toLowerCase());
          if (!slugMatch && !titleMatch) continue;
        }

        const images: string[] = [];
        if (post._embedded?.["wp:featuredmedia"]?.[0]) {
          const media = post._embedded["wp:featuredmedia"][0];
          images.push(media.source_url);
          for (const sz of Object.values(media.media_details.sizes) as Array<{ source_url: string }>) {
            images.push(sz.source_url);
          }
        }
        // Também extrai imagens do content
        const imgMatches = post.content.rendered.match(/src=["']([^"']+)["']/g);
        if (imgMatches) {
          for (const m of imgMatches) {
            const url = m.replace(/src=["']/, "").replace(/["']/, "");
            if (url.match(/\.(jpe?g|png|webp)$/i)) images.push(url);
          }
        }

        results.push({
          id: post.id,
          title: post.title.rendered,
          url: post.link,
          date: post.date,
          images: [...new Set(images)],
          jsonLd: extractJsonLdProducts(post.content?.rendered ?? ""),
        });
      }
    }

    return results.slice(0, limit);
  }

  /** Busca ofertas Komprão direto no endpoint custom post type */
  private async searchOfertas(limit: number): Promise<WpSearchResult[]> {
    const results: WpSearchResult[] = [];
    
    // Busca todas as ofertas (paginado) - SEM _embed pois não têm featured media
    let page = 1;
    const perPage = 20;
    
    while (results.length < limit) {
      const url = `${this.wpConfig.wpJsonUrl}/wp/v2/oferta?per_page=${perPage}&page=${page}`;
      const ofertas = await this.fetchJson<WpPost[]>(url);
      
      if (!ofertas.length) break;
      
      for (const oferta of ofertas) {
        if (results.length >= limit) break;
        
        // Filtro por cidade (slug contém a cidade)
        if (this.wpConfig.city) {
          const slugMatch = oferta.slug?.includes(this.wpConfig.city);
          const titleMatch = oferta.title?.rendered?.toLowerCase().includes(this.wpConfig.city.toLowerCase());
          if (!slugMatch && !titleMatch) continue;
        }

        const images: string[] = [];
        if (oferta._embedded?.["wp:featuredmedia"]?.[0]) {
          const media = oferta._embedded["wp:featuredmedia"][0];
          images.push(media.source_url);
          for (const sz of Object.values(media.media_details.sizes) as Array<{ source_url: string }>) {
            images.push(sz.source_url);
          }
        }
        // Também extrai imagens do content (oferta usa iframes do issuu)
        const imgMatches = oferta.content?.rendered?.match(/src=["']([^"']+)["']/g);
        if (imgMatches) {
          for (const m of imgMatches) {
            const url = m.replace(/src=["']/, "").replace(/["']/, "");
            if (url.match(/\.(jpe?g|png|webp)$/i)) images.push(url);
          }
        }
        // Fallback: og:image do yoast_head
        if (images.length === 0 && oferta.yoast_head) {
          const ogMatch = oferta.yoast_head.match(/og:image["']?\s*content=["']([^"']+)["']/i);
          if (ogMatch) images.push(ogMatch[1]);
        }

        results.push({
          id: oferta.id,
          title: oferta.title?.rendered ?? "Oferta",
          url: oferta.link,
          date: oferta.date,
          images: [...new Set(images)],
          jsonLd: extractJsonLdProducts(oferta.content?.rendered ?? ""),
        });
      }
      
      page++;
      if (ofertas.length < perPage) break;
    }

    return results.slice(0, limit);
  }

  private productPriceToNormalized(product: NonNullable<ReturnType<typeof toProductPrice>>, fallbackImage: string | null): NormalizedProduct {
    const baseUnit = this.normalizeUnit(product.unit);
    const baseQty = this.toBaseQuantity(product.quantity, product.unit);
    return {
      canonicalName: product.product_name,
      brand: product.brand,
      barcode: product.barcode,
      marketSku: null,
      quantity: product.quantity,
      unit: product.unit,
      normalizedQuantity: baseQty,
      normalizedUnit: baseUnit,
      price: product.price,
      promotionalPrice: product.promotional_price,
      imageUrl: product.image_url ?? fallbackImage,
      sourceUrl: product.source_url,
      source: product.source,
      collectedAt: product.collected_at,
      marketSlug: this.slug,
      rawName: product.product_name,
      categoryHint: null,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  getConfigSnapshot(): Record<string, unknown> {
    return {
      marketSlug: this.wpConfig.marketSlug,
      siteUrl: this.wpConfig.siteUrl,
      wpJsonUrl: this.wpConfig.wpJsonUrl,
      searchTerms: this.wpConfig.searchTerms,
      postType: this.wpConfig.postType,
      city: this.wpConfig.city,
      cityAttended: this.wpConfig.cityAttended,
    };
  }
}
