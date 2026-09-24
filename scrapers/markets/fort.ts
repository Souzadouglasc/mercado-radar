import type { OsuperMarketConfig } from "./osuper.js";

/**
 * Fort Atacadista (Osuper) — loja São José / Kobrasol.
 * storeId "1638" = RUA CASSOL, 1199 - KOBRASOL, São José-SC (CEP 88102-340).
 * Evidência (2026-09-24):
 * - `SearchActiveStoresQuery` via POST em
 *   https://api.fortatacadista.com.br/storefront/graphql retornou HTTP 500
 *   vazio (operação não aceita sem bundle/introspection desabilitada).
 * - Fallback: `window.INITIAL_STATE.storeSlugs` na home lista 79 lojas,
 *   incluindo kobrasol=1638, sao-jose=1659, areias=1666.
 * - Verificação por cookie: `Cookie: st_334={"id":"1638"}` na home retorna
 *   `selectedStore.slug="kobrasol"` + `fullAddress.city="São José", id=1638`
 *   (cookieSuffix 334 vem de `window.COOKIE_SUFFIX`).
 * - `st_334={"id":"1666"}` → slug "areias", endereço BARREIROS/São José
 *   (2ª loja SJ); `st_334={"id":"1659"}` recaiu no default 1585
 *   (loja "sao-jose" inativa no front) — por isso a principal é Kobrasol.
 * v1 usa sitemap + JSON-LD; storeId vai como cookie `st_334` (ver osuper.ts).
 */
export const fortConfig: OsuperMarketConfig = {
  marketSlug: "fort",
  siteUrl: "https://fortatacadista.com.br",
  apiUrl: "https://api.fortatacadista.com.br/storefront/graphql",
  storeId: "1638",
  cookieSuffix: "334",
};
