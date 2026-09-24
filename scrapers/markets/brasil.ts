import { extractJsonLdProduct, toProductPrice } from "./jsonld.js";
import type { ProductPrice, ScrapeResult, UrlOutcome } from "../core/types.js";

export interface WordPressMarketConfig {
  marketSlug: string;
  siteUrl: string;
  wpJsonUrl: string;
  city?: string;
}

export interface WpPost {
  id: number;
  date: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  _embedded?: {
    "wp:featuredmedia"?: Array<{ source_url: string; media_details: { sizes: Record<string, { source_url: string }> } }>;
  };
}

export interface WpSearchResult {
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

/** Busca posts do tipo "encarte" via wp-json search */
export async function searchEncartePosts(
  config: WordPressMarketConfig,
  limit: number,
): Promise<WpSearchResult[]> {
  const searchUrl = `${config.wpJsonUrl}/wp/v2/search?search=encarte&per_page=${limit}&subtype=post`;
  const searchResults = await fetchJson<Array<{ id: number; title: string; url: string; type: string; subtype: string }>>(searchUrl);

  const results: WpSearchResult[] = [];
  
  for (const sr of searchResults) {
    // Fetch full post with _embed to get featured media
    const postUrl = `${config.wpJsonUrl}/wp/v2/posts/${sr.id}?_embed`;
    const post = await fetchJson<WpPost>(postUrl);
    
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

  return results;
}

/** Baixa uma imagem e retorna buffer (para OCR futuro) */
export async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  } catch {
    return null;
  }
}

/** Placeholder para OCR futuro — hoje só registra para coleta manual */
export async function scrapeWordPressEncartes(
  config: WordPressMarketConfig,
  options: { limit?: number; throttleMs?: number } = {},
): Promise<ScrapeResult> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
  const startedAt = new Date().toISOString();

  const posts = await searchEncartePosts(config, limit);
  const items: ProductPrice[] = [];
  const outcomes: UrlOutcome[] = [];

  for (const post of posts) {
    await new Promise((r) => setTimeout(r, throttleMs));
    try {
      // Por enquanto: cria entrada "manual" apontando para o encarte
      // O preço será preenchido manualmente no admin ou via OCR futuro
      const item: ProductPrice = {
        product_name: post.title,
        brand: null,
        barcode: null,
        unit: null,
        quantity: null,
        price: 0, // placeholder — será preenchido manualmente
        promotional_price: null,
        market_slug: config.marketSlug,
        source_url: post.url,
        source: "encarte",
        collected_at: new Date().toISOString(),
        image_url: post.images[0] ?? null,
      };
      items.push(item);
      outcomes.push({ url: post.url, ok: true });
    } catch (err) {
      outcomes.push({
        url: post.url,
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