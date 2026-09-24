/**
 * Markets Registry - MercadoRadar
 * Configuração declarativa de todos os mercados.
 * O runner/orchestrator lê daqui — adicionar mercado = adicionar entry aqui.
 */

import type { MarketsConfig, MarketRegistryEntry } from "../core/provider.js";

export const MARKETS_CONFIG: MarketsConfig = {
  markets: [
    {
      slug: "fort",
      name: "Fort Atacadista",
      provider: "osuper",
      enabled: true,
      config: {
        marketSlug: "fort",
        siteUrl: "https://fortatacadista.com.br",
        apiUrl: "https://api.fortatacadista.com.br/storefront/graphql",
        storeId: "1638",
        cookieSuffix: "334",
        city: "São José",
      },
      schedule: {
        cron: "0 9 * * 1-6",     // 06:00 BRT seg-sab (incremental)
        fullCron: "0 8 * * 0",   // 05:00 BRT domingo (full)
      },
      baseline: {
        minProducts: 100,
        maxErrorRate: 0.5,
      },
    },
    {
      slug: "koch",
      name: "SuperKoch",
      provider: "osuper",
      enabled: true,
      config: {
        marketSlug: "koch",
        siteUrl: "https://www.superkoch.com.br",
        apiUrl: "https://api.superkoch.com.br/storefront/graphql",
        storeId: "1412",
        cookieSuffix: "295",
        city: "São José (atendida por Palhoça)",
      },
      schedule: {
        cron: "0 9 * * 1-6",
        fullCron: "0 8 * * 0",
      },
      baseline: {
        minProducts: 100,
        maxErrorRate: 0.5,
      },
    },
    {
      slug: "brasil",
      name: "Brasil Atacadista",
      provider: "wordpress",
      enabled: true,
      config: {
        marketSlug: "brasil",
        siteUrl: "https://www.brasilatacadista.com.br",
        wpJsonUrl: "https://www.brasilatacadista.com.br/wp-json",
        searchTerms: ["encarte", "oferta", "promoção"],
        postType: "post",
        cityAttended: "São José",
      },
      schedule: {
        cron: "0 9 * * *", // diário 06:00 BRT
      },
      baseline: {
        minProducts: 1,        // encartes são sazonais
        maxErrorRate: 0.8,     // mais permissivo
      },
    },
    {
      slug: "komprao",
      name: "Komprão",
      provider: "wordpress",
      enabled: true,
      config: {
        marketSlug: "komprao",
        siteUrl: "https://www.komprao.com.br",
        wpJsonUrl: "https://www.komprao.com.br/wp-json",
        searchTerms: ["oferta", "encarte", "promoção"],
        postType: "oferta",
        city: "sao-jose",
        cityAttended: "São José",
      },
      schedule: {
        cron: "0 9 * * *", // diário 06:00 BRT
      },
      baseline: {
        minProducts: 1,
        maxErrorRate: 0.8,
      },
    },
  ],
};

/** Retorna apenas mercados habilitados */
export function getEnabledMarkets(): MarketRegistryEntry[] {
  return MARKETS_CONFIG.markets.filter((m) => m.enabled);
}

/** Retorna mercado por slug */
export function getMarketConfig(slug: string): MarketRegistryEntry | undefined {
  return MARKETS_CONFIG.markets.find((m) => m.slug === slug);
}

/** Retorna slugs habilitados para matrix do GitHub Actions */
export function getEnabledSlugs(): string[] {
  return getEnabledMarkets().map((m) => m.slug);
}