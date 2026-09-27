/**
 * Provider Registry - MercadoRadar
 * Factory que instancia providers a partir da config declarativa.
 * Singleton pattern para reuso no runner/orchestrator.
 */

import type { MarketProvider, MarketRegistryEntry, ProviderFactory } from "../core/provider.js";
import { getEnabledMarkets } from "../config/markets.config.js";
import { OsuperProvider, type OsuperProviderConfig } from "../core/providers/osuper/index.js";
import { WordPressProvider, type WordPressProviderConfig } from "../core/providers/wordpress/index.js";
import { VtexProvider, type VtexProviderConfig } from "../core/providers/vtex/index.js";

const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  osuper: (config) => new OsuperProvider(config as unknown as OsuperProviderConfig),
  wordpress: (config) => new WordPressProvider(config as unknown as WordPressProviderConfig),
  vtex: (config) => new VtexProvider(config as unknown as VtexProviderConfig),
};

class ProviderRegistry {
  private providers = new Map<string, MarketProvider>();
  private initialized = false;

  /** Inicializa providers a partir do MARKETS_CONFIG */
  initialize(entries: MarketRegistryEntry[]): void {
    if (this.initialized) return;
    
    for (const entry of entries) {
      if (!entry.enabled) continue;
      
      const factory = PROVIDER_FACTORIES[entry.provider];
      if (!factory) {
        console.warn(`[Registry] Provider type "${entry.provider}" não registrado para mercado "${entry.slug}"`);
        continue;
      }

      try {
        const provider = factory(entry.config);
        this.providers.set(entry.slug, provider);
        console.log(`[Registry] Provider registrado: ${entry.slug} (${entry.provider})`);
      } catch (err) {
        console.error(`[Registry] Falha ao instanciar provider ${entry.slug}:`, err);
      }
    }
    
    this.initialized = true;
  }

  /** Retorna provider por slug */
  get(slug: string): MarketProvider | undefined {
    return this.providers.get(slug);
  }

  /** Retorna todos os providers registrados */
  getAll(): MarketProvider[] {
    return Array.from(this.providers.values());
  }

  /** Retorna slugs registrados */
  getSlugs(): string[] {
    return Array.from(this.providers.keys());
  }

  /** Verifica se provider existe */
  has(slug: string): boolean {
    return this.providers.has(slug);
  }

  /** Registrar provider custom (para testes ou providers dinâmicos) */
  register(slug: string, provider: MarketProvider): void {
    this.providers.set(slug, provider);
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry();

/** Inicializa o registry com a config padrão */
export function initializeRegistry(entries?: MarketRegistryEntry[]): void {
  providerRegistry.initialize(entries ?? getEnabledMarkets());
}
