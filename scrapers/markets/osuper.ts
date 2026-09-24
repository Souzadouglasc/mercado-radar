import { extractJsonLdProduct, toProductPrice } from "./jsonld.js";
import type { ProductPrice, ScrapeResult, UrlOutcome } from "../core/types.js";

export interface OsuperMarketConfig {
  /** Slug em `markets.slug` (ex.: "fort"). */
  marketSlug: string;
  /** URL base da loja (ex.: https://fortatacadista.com.br). */
  siteUrl: string;
  /** Endpoint GraphQL Osuper (v1: documentado p/ uso futuro; coleta usa sitemap+JSON-LD). */
  apiUrl: string;
  /** storeId Osuper — enviado como cookie `st_<cookieSuffix>` p/ preço da loja certa. */
  storeId: string;
  /** Sufixo do cookie de loja Osuper (ex. Fort "334" → `st_334`). */
  cookieSuffix?: string;
}

export interface SitemapEntry {
  url: string;
  /** Conteúdo bruto de `<lastmod>`, quando presente. */
  lastmod?: string;
}

export interface OsuperScrapeOptions {
  limit?: number;
  /** ms entre requisições de página (default 2000 — respeita robots/throttle). */
  throttleMs?: number;
  /** Tentativas por URL além da primeira (default 2). */
  retries?: number;
  onProgress?: (done: number, total: number, url: string) => void;
  /** Workers simultâneos (default 4, 1..8). Disparos espaçados de throttleMs/concurrency. */
  concurrency?: number;
  /** Só coleta URLs com lastmod ≤ 72h (quando o sitemap tem lastmod). */
  incremental?: boolean;
  /** Ignora o filtro incremental — coleta tudo até `limit`. */
  full?: boolean;
  /** Offset p/ fatiar a coleta (fallback quando não há lastmod; rotaciona por dia). */
  skip?: number;
  /** Injetável p/ testes (default: agora). */
  nowMs?: number;
}

export const USER_AGENT = "MercadoRadar/1.0 +contato";
export const DEFAULT_LIMIT = 200;
export const DEFAULT_THROTTLE_MS = 2000;
export const DEFAULT_CONCURRENCY = 4;
export const MAX_CONCURRENCY = 8;
/** Janela do incremental (72h). */
export const INCREMENTAL_MAX_AGE_MS = 72 * 3600 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(
  url: string,
  retries: number,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          ...extraHeaders,
        },
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

/**
 * Parseia o sitemap extraindo URLs `/produtos/*` + `<lastmod>` opcional.
 * Fort/Koch (2026-09-24): sitemap NÃO tem `<lastmod>` — só
 * `<loc>`, `<changefreq>`, `<priority>`. O incremental usa `skip`
 * (ver `selectEntries`); se a Osuper adicionar lastmod, o filtro passa
 * a valer automaticamente.
 */
export function parseSitemapEntries(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  const seen = new Set<string>();
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const body = m[1];
    const loc = body.match(/<loc>(https:\/\/[^<]*?\/produtos\/[^<]*)<\/loc>/);
    if (!loc) continue;
    const url = loc[1].trim();
    if (seen.has(url)) continue;
    seen.add(url);
    const lm = body.match(/<lastmod>([^<]*)<\/lastmod>/);
    entries.push(lm ? { url, lastmod: lm[1].trim() } : { url });
  }
  return entries;
}

export interface SelectOptions {
  limit: number;
  skip?: number;
  incremental?: boolean;
  full?: boolean;
  nowMs?: number;
}

/**
 * Aplica filtro incremental + fatiamento. Puro (testável sem rede).
 * - incremental sem lastmod no sitemap → fallback: fatia por `skip`/`limit`
 *   (o workflow rotaciona `skip` por dia da semana).
 * - `skip` além do total dá a volta (rotação com wrap) p/ nunca vir vazio
 *   nem curto: a fatia atravessa o fim (ex. skip=5, total=3 → [c, a]).
 * - entradas sem lastmod (sitemap misto) são mantidas — não dá p/ provar
 *   que estão velhas.
 */
export function selectEntries(
  entries: SitemapEntry[],
  opts: SelectOptions,
): { selected: SitemapEntry[]; hasLastmod: boolean; total: number } {
  const total = entries.length;
  const hasLastmod = entries.some(
    (e) => e.lastmod != null && !Number.isNaN(Date.parse(e.lastmod)),
  );
  let pool = entries;
  if (opts.incremental && !opts.full && hasLastmod) {
    const now = opts.nowMs ?? Date.now();
    pool = entries.filter((e) => {
      if (e.lastmod == null) return true;
      const t = Date.parse(e.lastmod);
      return !Number.isNaN(t) && now - t <= INCREMENTAL_MAX_AGE_MS;
    });
  }
  const skip = pool.length > 0 ? Math.max(0, Math.floor(opts.skip ?? 0)) % pool.length : 0;
  // Rotação com volta: fatia pode atravessar o fim (ex. skip=5, total=3 → [c, a]).
  const rotated = [...pool.slice(skip), ...pool.slice(0, skip)];
  return { selected: rotated.slice(0, opts.limit), hasLastmod, total };
}

/** Baixa o sitemap e extrai URLs `/produtos/*` (ordem do sitemap, até `limit`). */
export async function listProductUrls(
  config: OsuperMarketConfig,
  limit: number,
  retries = 2,
): Promise<string[]> {
  const xml = await fetchText(`${config.siteUrl.replace(/\/$/, "")}/sitemap.xml`, retries);
  return selectEntries(parseSitemapEntries(xml), { limit }).selected.map((e) => e.url);
}

/**
 * Estratégia v1 (sem introspection GraphQL): sitemap → HTML de cada
 * `/produtos/*` → JSON-LD schema.org/Product → ProductPrice.
 *
 * Paralelismo controlado: `concurrency` workers com disparos espaçados de
 * ao menos `throttleMs/concurrency` (mutex de decolagem) — agregado
 * ~1 req/(throttleMs/concurrency) por host. Retry/backoff preservados.
 * `onProgress` é thread-safe: JS é single-thread, `done++` é atômico.
 */
export async function scrapeOsuperMarket(
  config: OsuperMarketConfig,
  options: OsuperScrapeOptions = {},
): Promise<ScrapeResult> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
  const retries = options.retries ?? 2;
  const concurrency = Math.min(
    MAX_CONCURRENCY,
    Math.max(1, Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY)),
  );
  const skip = Math.max(0, Math.floor(options.skip ?? 0));
  const incremental = (options.incremental ?? false) && !options.full;
  const startedAt = new Date().toISOString();

  const xml = await fetchText(
    `${config.siteUrl.replace(/\/$/, "")}/sitemap.xml`,
    retries,
  );
  const { selected, hasLastmod, total } = selectEntries(parseSitemapEntries(xml), {
    limit,
    skip,
    incremental,
    full: options.full,
    nowMs: options.nowMs,
  });
  const urls = selected.map((e) => e.url);

  const headers: Record<string, string> | undefined =
    config.cookieSuffix != null && /^\d+$/.test(config.storeId)
      ? { Cookie: `st_${config.cookieSuffix}={"id":"${config.storeId}"}` }
      : undefined;

  const items: (ProductPrice | null)[] = new Array(urls.length).fill(null);
  const outcomes: (UrlOutcome | null)[] = new Array(urls.length).fill(null);

  // Mutex de decolagem: garante ≥ throttleMs/concurrency entre inícios de request.
  const interval = throttleMs / concurrency;
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

  let next = 0;
  let done = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const idx = next++;
      if (idx >= urls.length) return;
      const url = urls[idx];
      await spacedStart();
      try {
        const collectedAt = new Date().toISOString();
        const html = await fetchText(url, retries, headers);
        const jsonld = extractJsonLdProduct(html);
        if (!jsonld) {
          outcomes[idx] = { url, ok: false, error: "jsonld_not_found" };
        } else {
          const item = toProductPrice({
            jsonld,
            marketSlug: config.marketSlug,
            sourceUrl: url,
            collectedAt,
          });
          if (!item) {
            outcomes[idx] = { url, ok: false, error: "invalid_price" };
          } else {
            items[idx] = item;
            outcomes[idx] = { url, ok: true };
          }
        }
      } catch (err) {
        outcomes[idx] = {
          url,
          ok: false,
          error: err instanceof Error ? err.message.slice(0, 200) : String(err),
        };
      }
      done += 1; // atômico (event loop single-thread)
      options.onProgress?.(done, urls.length, url);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()),
  );

  if (incremental && !hasLastmod) {
    console.log(
      `[osuper] sitemap sem <lastmod> (total=${total}) — fallback por skip=${skip} limit=${limit}`,
    );
  }

  return {
    marketSlug: config.marketSlug,
    items: items.filter((i): i is ProductPrice => i != null),
    outcomes: outcomes.filter((o): o is UrlOutcome => o != null),
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
