import type { OsuperMarketConfig } from "./osuper.js";

/**
 * Fort Atacadista (Osuper).
 * storeId "1585" = Balneário Camboriú — confirmado via cookie `st_334`
 * retornado pelo próprio site (Set-Cookie: {"id":"1585",...}).
 * v1 usa sitemap + JSON-LD; apiUrl/storeId documentados p/ GraphQL futuro.
 */
export const fortConfig: OsuperMarketConfig = {
  marketSlug: "fort",
  siteUrl: "https://fortatacadista.com.br",
  apiUrl: "https://api.fortatacadista.com.br/storefront/graphql",
  storeId: "1585",
};
