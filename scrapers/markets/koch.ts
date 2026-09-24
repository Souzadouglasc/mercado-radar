import type { OsuperMarketConfig } from "./osuper.js";

/**
 * SuperKoch (Osuper, mesmo padrão do Fort) — loja Palhoça (atende São José).
 * storeId "1412" = Rua Vereador Osvaldo de Oliveira, 4125 - Centro,
 * Palhoça-SC (CEP 88131-200) — município vizinho a São José, entrega SJ.
 * Evidência (2026-09-24):
 * - `SearchActiveStoresQuery` via POST em
 *   https://api.superkoch.com.br/storefront/graphql retornou vazio
 *   (introspection desabilitada, operação do bundle necessária).
 * - Fallback: `window.INITIAL_STATE.storeSlugs` na home lista 12 lojas,
 *   NENHUMA em São José: itajai=1407, itapema=1408, penha=1409,
 *   navegantes=1410, florianopolis=1411, palhoca=1412, saofrancisco=1413,
 *   gaspar=1414, camboriu=1415 (default), blumenau=1416, tijucas=1535,
 *   joinville=1815. Palhoça é a que atende SJ (fronteira direta).
 * - Verificação por cookie: `Cookie: st_295={"id":"1412"}` na home retorna
 *   `selectedStore.slug="palhoca"` + `fullAddress.city="Palhoça", id=1412`
 *   (cookieSuffix 295 vem de `window.COOKIE_SUFFIX`).
 * v1 usa sitemap + JSON-LD; storeId vai como cookie `st_295` (ver osuper.ts).
 */
export const kochConfig: OsuperMarketConfig = {
  marketSlug: "koch",
  siteUrl: "https://www.superkoch.com.br",
  apiUrl: "https://api.superkoch.com.br/storefront/graphql",
  storeId: "1412",
  cookieSuffix: "295",
};
