/**
 * Sitemap Parser - MercadoRadar
 * Extrai URLs de produtos do sitemap.xml + filtro incremental + fatiamento.
 * Puro (testável sem rede).
 */

export interface SitemapEntry {
  url: string;
  lastmod?: string;
}

/**
 * Parseia o sitemap extraindo URLs `/produtos/*` + `<lastmod>` opcional.
 * Fort/Koch (2026-09): sitemap NÃO tem `<lastmod>` — só `<loc>`, `<changefreq>`, `<priority>`.
 * O incremental usa `skip` (ver `selectEntries`); se a Osuper adicionar lastmod,
 * o filtro passa a valer automaticamente.
 */
export function parseSitemapEntries(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  const seen = new Set<string>();

  // Regex para cada <url>...</url>
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
 * Aplica filtro incremental + fatiamento.
 * - incremental sem lastmod no sitemap → fallback: fatia por `skip`/`limit`
 *   (o workflow rotaciona `skip` por dia da semana).
 * - `skip` além do total dá a volta (rotação com wrap) p/ nunca vir vazio
 *   nem curto: a fatia atravessa o fim (ex. skip=5, total=3 → [c, a]).
 * - entradas sem lastmod (sitemap misto) são mantidas — não dá p/ provar
 *   que estão velhas.
 */
export function selectEntries(
  entries: SitemapEntry[],
  opts: SelectOptions
): { selected: SitemapEntry[]; hasLastmod: boolean; total: number } {
  const total = entries.length;
  const hasLastmod = entries.some(
    (e) => e.lastmod != null && !Number.isNaN(Date.parse(e.lastmod))
  );
  let pool = entries;
  const INCREMENTAL_MAX_AGE_MS = 72 * 3600 * 1000;

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