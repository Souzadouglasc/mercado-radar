import { extractJsonLdProduct, toProductPrice } from "./jsonld.js";
import type { ProductPrice, ScrapeResult, UrlOutcome } from "../core/types.js";

export interface KompraoMarketConfig {
  marketSlug: string;
  siteUrl: string;
  wpJsonUrl: string;
  city: string; // ex.: "sao-jose", "florianopolis"
}

export interface WpPage {
  id: number;
  date: string;
  link: string;
  slug: string;
  title: { rendered: string };
  content: { rendered: string };
  _embedded?: {
    "wp:featuredmedia"?: Array<{ source_url: string; media_details: { sizes: Record<string, { source_url: string }> } }>;
  };
}

export interface KompraoPageResult {
  id: number;
  title: string;
  url: string;
  date: string;
  images: string[];
}

const USER_AGENT = "MercadoRadar/1.0 +contato";
const DEFAULT_LIMIT = 50;
const DEFAULT_THROTTLE_MS = 2000;

async function fetchJson<T>(url: string, retries = 2): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Busca páginas de ofertas por cidade via wp-json */
export async function searchOfertaPages(
  config: KompraoMarketConfig,
  limit: number,
): Promise<KompraoPageResult[]> {
  // Komprão usa páginas em /ofertas/<cidade>/ — busca por slug da cidade
  const searchUrl = `${config.wpJsonUrl}/wp/v2/pages?search=${encodeURIComponent(config.city)}&per_page=${limit}`;
  const pages = await fetchJson<WpPage[]>(searchUrl);

  return pages
    .filter((p) => p.slug?.includes(config.city) || p.title.rendered.toLowerCase().includes(config.city.toLowerCase()))
    .map((p) => {
      const images: string[] = [];
      if (p._embedded?.["wp:featuredmedia"]?.[0]) {
        const media = p._embedded["wp:featuredmedia"][0];
        images.push(media.source_url);
        for (const sz of Object.values(media.media_details.sizes)) {
          images.push(sz.source_url);
        }
      }
      const imgMatches = p.content.rendered.match(/src=["']([^"']+)["']/g);
      if (imgMatches) {
        for (const m of imgMatches) {
          const url = m.replace(/src=["']/, "").replace(/["']/, "");
          if (url.match(/\.(jpe?g|png|webp)$/i)) images.push(url);
        }
      }
      return {
        id: p.id,
        title: p.title.rendered,
        url: p.link,
        date: p.date,
        images: [...new Set(images)],
      };
    })
    .slice(0, limit);
}

/** Placeholder para OCR futuro — hoje só registra para coleta manual */
export async function scrapeKompraoOfertas(
  config: KompraoMarketConfig,
  options: { limit?: number; throttleMs?: number } = {},
): Promise<ScrapeResult> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
  const startedAt = new Date().toISOString();

  const pages = await searchOfertaPages(config, limit);
  const items: ProductPrice[] = [];
  const outcomes: UrlOutcome[] = [];

  for (const page of pages) {
    await new Promise((r) => setTimeout(r, throttleMs));
    try {
      const item: ProductPrice = {
        product_name: page.title,
        brand: null,
        barcode: null,
        unit: null,
        quantity: null,
        price: 0, // placeholder — será preenchido manualmente
        promotional_price: null,
        market_slug: config.marketSlug,
        source_url: page.url,
        source: "encarte",
        collected_at: new Date().toISOString(),
        image_url: page.images[0] ?? null,
      };
      items.push(item);
      outcomes.push({ url: page.url, ok: true });
    } catch (err) {
      outcomes.push({
        url: page.url,
        ok: false,
        error: err instanceof Error ? err.message.slice(0, 200) : String(err),
      });
    }
  }

  return {
    marketSlug: config.marketSlug,
    items,
    outcomes,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}