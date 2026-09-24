/**
 * WordPress Provider - MercadoRadar
 * Provider para mercados WordPress (Brasil Atacadista, Komprão).
 * Estratégia: wp-json REST API → busca posts/páginas → extrai imagens → NormalizedProduct com price=0 (source='encarte')
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

export interface WordPressProviderConfig {
  /** Slug em markets.slug (ex.: "brasil", "komprao") */
  marketSlug: string;
  /** URL base do site */
  siteUrl: string;
  /** URL base do wp-json (ex.: https://site.com.br/wp-json) */
  wpJsonUrl: string;
  /** Termos de busca para encontrar encartes/ofertas */
  searchTerms: string[];
  /** Tipo de post: "post" (Brasil encartes) | "page" (Komprão ofertas) */
  postType: "post" | "page";
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

    // 1. Busca posts/páginas de encarte/oferta
    const searchResults = await this.searchEncartes(limit);

    // 2. Para cada resultado, cria NormalizedProduct (price=0 placeholder)
    const items: NormalizedProduct[] = [];
    const outcomes: UrlOutcome[] = [];

    for (const sr of searchResults) {
      await this.sleep(throttleMs); // throttle sequencial
      try {
        const item = this.createEncarteProduct(sr);
        items.push(item);
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

  /** Busca encartes/ofertas via wp-json search */
  private async searchEncartes(limit: number): Promise<WpSearchResult[]> {
    const results: WpSearchResult[] = [];

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

        // Fetch full post/page with _embed to get featured media
        const postUrl = `${this.wpConfig.wpJsonUrl}/wp/v2/${this.wpConfig.postType}s/${sr.id}?_embed`;
        const post = await this.fetchJson<WpPost>(postUrl);

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
          for (const sz of Object.values(media.media_details.sizes)) {
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
        });
      }
    }

    return results.slice(0, limit);
  }

  /** Cria NormalizedProduct para encarte (price=0, source='encarte') */
  private createEncarteProduct(sr: WpSearchResult): NormalizedProduct {
    const collectedAt = new Date().toISOString();
    const baseUnit = this.normalizeUnit(null);
    const baseQty = this.toBaseQuantity(null, null);

    return {
      canonicalName: sr.title, // será normalizado no catalog
      brand: null,
      barcode: null,
      marketSku: null,
      quantity: null,
      unit: null,
      normalizedQuantity: baseQty,
      normalizedUnit: baseUnit,
      price: 0, // placeholder — preenchido manualmente ou via OCR futuro
      promotionalPrice: null,
      imageUrl: sr.images[0] ?? null,
      sourceUrl: sr.url,
      source: "encarte",
      collectedAt,
      marketSlug: this.slug,
      rawName: sr.title,
      categoryHint: this.inferCategoryFromTitle(sr.title),
    };
  }

  /** Infere dica de categoria pelo título do encarte */
  private inferCategoryFromTitle(title: string): string {
    const t = title.toLowerCase();
    if (t.includes("hortifruti") || t.includes("fruta") || t.includes("verdura") || t.includes("legume")) return "Hortifruti";
    if (t.includes("açougue") || t.includes("carne") || t.includes("frango") || t.includes("peixe")) return "Açougue";
    if (t.includes("frios") || t.includes("laticínio") || t.includes("leite") || t.includes("queijo") || t.includes("iogurte")) return "Frios e Laticínios";
    if (t.includes("bebida") || t.includes("cerveja") || t.includes("refrigerante") || t.includes("suco") || t.includes("água")) return "Bebidas";
    if (t.includes("limpeza") || t.includes("detergente") || t.includes("sabão") || t.includes("amaciante")) return "Limpeza";
    if (t.includes("higiene") || t.includes("beleza") || t.includes("shampoo") || t.includes("sabonete") || t.includes("pasta")) return "Higiene e Beleza";
    if (t.includes("padaria") || t.includes("pão") || t.includes("bolo") || t.includes("biscoito")) return "Padaria";
    if (t.includes("congelado") || t.includes("gelado") || t.includes("sorvete")) return "Congelados";
    if (t.includes("pet") || t.includes("ração") || t.includes("gato") || t.includes("cachorro")) return "Pet";
    return "Mercearia"; // default
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