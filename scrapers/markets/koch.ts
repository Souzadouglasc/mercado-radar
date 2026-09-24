import type { OsuperMarketConfig } from "./osuper.js";

/**
 * SuperKoch (Osuper, mesmo padrão do Fort).
 * storeId: loja online "Superkoch LJ81 - Camboriú". Não exposto em cookie
 * público legível sem sessão de loja; GraphQL com introspection desabilitada
 * impede descoberta via `SearchActiveStoresQuery` sem a operação exata do bundle.
 * v1 usa sitemap + JSON-LD e NÃO precisa de storeId — valor abaixo é
 * placeholder documentado; ver scrapers/README.md ("descobrir storeId").
 */
export const kochConfig: OsuperMarketConfig = {
  marketSlug: "superkoch",
  siteUrl: "https://www.superkoch.com.br",
  apiUrl: "https://api.superkoch.com.br/storefront/graphql",
  storeId: "TODO-descobrir-via-bundle-ou-trafego",
};
