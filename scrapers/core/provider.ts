/**
 * Core Provider Interface - MercadoRadar
 * Interface comum para todos os provedores de mercado.
 * Permite adicionar novos mercados sem alterar o runner/orchestrator.
 */

import type { ScrapeResult, UrlOutcome, RunStats } from "./types.js";

// Re-export types for consumers
export type { UrlOutcome, RunStats, ScrapeResult } from "./types.js";

/** Opções de coleta passadas para o provider */
export interface CollectOptions {
  /** Máximo de itens a coletar */
  limit: number;
  /** Coleta apenas itens recentes (≤ 72h) quando o provider suporta */
  incremental: boolean;
  /** Ignora filtro incremental — coleta tudo até limit */
  full: boolean;
  /** Offset para paginação/fatia (fallback quando não há lastmod) */
  skip: number;
  /** Workers simultâneos (1..8) */
  concurrency: number;
  /** ms entre requisições agregadas (throttle) */
  throttleMs: number;
  /** Retries para requisições HTTP */
  retries: number;
  /** Callback de progresso (thread-safe: done++ é atômico no event loop) */
  onProgress?: (done: number, total: number, url: string) => void;
  /** Timestamp injetável para testes determinísticos */
  nowMs?: number;
}

/** Metadados do mercado para observabilidade e configuração */
export interface MarketMetadata {
  /** Slug único (ex.: "fort", "koch", "brasil", "komprao") */
  slug: string;
  /** Nome exibível */
  name: string;
  /** Tipo de provider: "osuper" | "wordpress" | "custom" */
  providerType: string;
  /** Cidade principal atendida */
  city?: string;
  /** URL base do site */
  siteUrl: string;
}

/** Produto normalizado — formato canônico independente do mercado */
export interface NormalizedProduct {
  /** Nome canônico (sem quantidade/unidade, sem acentos, lowercase) */
  canonicalName: string;
  /** Marca normalizada */
  brand: string | null;
  /** EAN/GTIN quando disponível (código de barras universal) */
  barcode: string | null;
  /** SKU interno do mercado (não é EAN) */
  marketSku: string | null;
  /** Quantidade na unidade original (ex.: 500) */
  quantity: number | null;
  /** Unidade original (ex.: "g", "ml", "un") */
  unit: string | null;
  /** Quantidade normalizada na unidade base (kg, L, un) */
  normalizedQuantity: number | null;
  /** Unidade base normalizada: "kg" | "L" | "un" */
  normalizedUnit: "kg" | "L" | "un" | null;
  /** Preço total do produto */
  price: number;
  /** Preço promocional se houver */
  promotionalPrice: number | null;
  /** URL da imagem do produto */
  imageUrl: string | null;
  /** URL de origem (página do produto/encarte) */
  sourceUrl: string | null;
  /** Fonte do preço */
  source: "site-jsonld" | "graphql" | "manual" | "encarte";
  /** Timestamp da coleta (ISO 8601 com offset) */
  collectedAt: string;
  /** Slug do mercado de origem */
  marketSlug: string;
  /** Nome bruto original do mercado (para alias) */
  rawName: string;
  /** Dica de categoria (do template ou heurística) */
  categoryHint: string | null;
}

/** Resultado bruto da coleta (antes da normalização) */
export interface RawProduct {
  /** Nome como vem do mercado */
  name: string;
  brand?: string | null;
  barcode?: string | null;
  sku?: string | null;
  quantity?: number | null;
  unit?: string | null;
  price: number;
  promotionalPrice?: number | null;
  imageUrl?: string | null;
  sourceUrl: string;
  source: "site-jsonld" | "graphql" | "manual" | "encarte";
  collectedAt: string;
  marketSlug: string;
  /** Dados extras específicos do provider */
  extras?: Record<string, unknown>;
}

/** Resultado da coleta de um provider */
export interface CollectResult {
  /** Produtos já normalizados */
  items: NormalizedProduct[];
  /** Outcome por URL tentada */
  outcomes: UrlOutcome[];
  /** Estatísticas da execução */
  stats: RunStats;
  startedAt: string;
  finishedAt: string;
}

/** Interface que todo provider deve implementar */
export interface MarketProvider {
  /** Slug do mercado (chave única no registry) */
  readonly slug: string;
  /** Metadados para logging/observabilidade */
  readonly metadata: MarketMetadata;
  /** Configuração bruta do mercado (para snapshot em scrape_runs) */
  readonly config: Record<string, unknown>;

  /**
   * Executa a coleta conforme opções.
   * Deve respeitar: limit, incremental/full, skip, concurrency, throttleMs.
   * Deve chamar onProgress periodicamente.
   */
  collect(options: CollectOptions): Promise<CollectResult>;

  /**
   * Valida se um item bruto tem dados mínimos para virar NormalizedProduct.
   * Usado para filtrar antes da normalização.
   */
  validateItem(item: RawProduct): boolean;

  /**
   * Retorna configuração serializável para snapshot em scrape_runs.config_snapshot
   */
  getConfigSnapshot(): Record<string, unknown>;
}

/** Fábrica de providers — cria instância a partir de config declarativa */
export type ProviderFactory = (config: Record<string, unknown>) => MarketProvider;

/** Registry entry — configuração declarativa de um mercado */
export interface MarketRegistryEntry {
  /** Slug único (deve bater com markets.slug no Supabase) */
  slug: string;
  /** Nome exibível */
  name: string;
  /** Tipo de provider: "osuper" | "wordpress" | string (custom) */
  provider: string;
  /** Habilitado para coleta automática */
  enabled: boolean;
  /** Configuração específica do provider */
  config: Record<string, unknown>;
  /** Agendamento cron (UTC) */
  schedule: {
    /** Cron incremental (diário seg-sab) */
    cron: string;
    /** Cron full (domingo) — opcional */
    fullCron?: string;
  };
  /** Gates de qualidade */
  baseline: {
    /** Mínimo de produtos esperados (30% disso falha o gate) */
    minProducts: number;
    /** Taxa máxima de erro (50% default) */
    maxErrorRate: number;
  };
}

/** Configuração completa do registry */
export interface MarketsConfig {
  markets: MarketRegistryEntry[];
}