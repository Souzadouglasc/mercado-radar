import { extractJsonLdProduct, toProductPrice } from "./jsonld.js";
import type { ProductPrice, ScrapeResult, UrlOutcome } from "../core/types.js";

export interface OsuperMarketConfig {
  /** Slug em `markets.slug` (ex.: "fort"). */
  marketSlug: string;
  /** URL base da loja (ex.: https://fortatacadista.com.br). */
  siteUrl: string;
  /** Endpoint GraphQL Osuper (v1: documentado p/ uso futuro; coleta usa sitemap+JSON-LD). */
  apiUrl: string;
  /** storeId Osuper (v1: documentado p/ uso futuro; coleta usa sitemap+JSON-LD). */
  storeId: string;
}

export interface OsuperScrapeOptions {
  limit?: number;
  /** ms entre requisições de página (default 2000 — respeita robots/throttle). */
  throttleMs?: number;
  /** Tentativas por URL além da primeira (default 2). */
  retries?: number;
  onProgress?: (done: number, total: number, url: string) => void;
}

export const USER_AGENT = "MercadoRadar/1.0 +contato";
const DEFAULT_LIMIT = 200;
const DEFAULT_THROTTLE_MS = 2000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string, retries: number): Promise<string> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastError = err;
      if (attempt < retries) await sleep(1000 * 2 ** attempt); // backoff 1s, 2s
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Baixa o sitemap e extrai URLs `/produtos/*` (ordem do sitemap, até `limit`). */
export async function listProductUrls(
  config: OsuperMarketConfig,
  limit: number,
  retries = 2,
): Promise<string[]> {
  const xml = await fetchText(`${config.siteUrl.replace(/\/$/, "")}/sitemap.xml`, retries);
  const urls: string[] = [];
  const re = /<loc>(https:\/\/[^<]*?\/produtos\/[^<]*)<\/loc>/g;
  for (const m of xml.matchAll(re)) {
    if (!urls.includes(m[1])) urls.push(m[1]);
    if (urls.length >= limit) break;
  }
  return urls;
}

/**
 * Estratégia v1 (sem introspection GraphQL): sitemap → HTML de cada
 * `/produtos/*` → JSON-LD schema.org/Product → ProductPrice.
 */
export async function scrapeOsuperMarket(
  config: OsuperMarketConfig,
  options: OsuperScrapeOptions = {},
): Promise<ScrapeResult> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
  const retries = options.retries ?? 2;
  const startedAt = new Date().toISOString();

  const urls = await listProductUrls(config, limit, retries);
  const items: ProductPrice[] = [];
  const outcomes: UrlOutcome[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (i > 0) await sleep(throttleMs);
    try {
      const collectedAt = new Date().toISOString();
      const html = await fetchText(url, retries);
      const jsonld = extractJsonLdProduct(html);
      if (!jsonld) {
        outcomes.push({ url, ok: false, error: "jsonld_not_found" });
      } else {
        const item = toProductPrice({
          jsonld,
          marketSlug: config.marketSlug,
          sourceUrl: url,
          collectedAt,
        });
        if (!item) {
          outcomes.push({ url, ok: false, error: "invalid_price" });
        } else {
          items.push(item);
          outcomes.push({ url, ok: true });
        }
      }
    } catch (err) {
      outcomes.push({
        url,
        ok: false,
        error: err instanceof Error ? err.message.slice(0, 200) : String(err),
      });
    }
    options.onProgress?.(i + 1, urls.length, url);
  }

  return { marketSlug: config.marketSlug, items, outcomes, startedAt, finishedAt: new Date().toISOString() };
}
