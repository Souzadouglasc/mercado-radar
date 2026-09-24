/**
 * Product Catalog - MercadoRadar
 * Responsável por match/criação de produtos no catálogo normalizado.
 * Prioridade: EAN → alias (market+raw_name) → canonical_name fuzzy (v2) → novo produto.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "./normalize.js";

export interface ProductRef {
  productId: string;
  isNew: boolean;
  matchedBy: "ean" | "alias" | "canonical" | "new";
}

export interface NormalizedProductForCatalog {
  canonicalName: string;
  brand: string | null;
  barcode: string | null;           // EAN/GTIN
  marketSku: string | null;         // SKU do mercado
  quantity: number | null;
  unit: string | null;
  normalizedQuantity: number | null;
  normalizedUnit: "kg" | "L" | "un" | null;
  imageUrl: string | null;
  categoryHint: string | null;
  marketSlug: string;
  rawName: string;
  collectedAt: string;
}

export class ProductCatalog {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Match ou cria produto no catálogo.
   * Retorna productId + metadados de como foi matchado.
   */
  async matchOrCreate(product: NormalizedProductForCatalog): Promise<ProductRef> {
    // 1. Tenta EAN/GTIN (exato)
    if (product.barcode) {
      const { data, error } = await this.supabase
        .from("products")
        .select("id")
        .eq("ean", product.barcode)
        .maybeSingle();
      
      if (!error && data) {
        // Atualiza last_seen_at
        await this.supabase
          .from("products")
          .update({ last_seen_at: product.collectedAt })
          .eq("id", data.id);
        return { productId: data.id, isNew: false, matchedBy: "ean" };
      }
    }

    // 2. Tenta alias (market + raw_name)
    const marketId = await this.getMarketId(product.marketSlug);
    if (marketId) {
      const { data: alias } = await this.supabase
        .from("product_aliases")
        .select("product_id")
        .eq("market_id", marketId)
        .eq("raw_name", product.rawName)
        .maybeSingle();
      
      if (alias) {
        await this.supabase
          .from("products")
          .update({ last_seen_at: product.collectedAt })
          .eq("id", alias.product_id);
        return { productId: alias.product_id, isNew: false, matchedBy: "alias" };
      }
    }

    // 3. Tenta nome canônico exato (fallback antes de criar novo)
    const canonicalSlug = slugify(product.canonicalName);
    const { data: byCanonical } = await this.supabase
      .from("products")
      .select("id")
      .eq("slug", canonicalSlug)
      .maybeSingle();
    
    if (byCanonical) {
      // Registra alias para próximas vezes
      if (marketId) {
        await this.supabase.from("product_aliases").upsert({
          product_id: byCanonical.id,
          market_id: marketId,
          raw_name: product.rawName,
        }, { onConflict: "product_id,market_id,raw_name" });
      }
      await this.supabase
        .from("products")
        .update({ last_seen_at: product.collectedAt })
        .eq("id", byCanonical.id);
      return { productId: byCanonical.id, isNew: false, matchedBy: "canonical" };
    }

    // 4. Cria novo produto com campos normalizados
    const { data: inserted, error: insertError } = await this.supabase
      .from("products")
      .upsert({
        name: product.canonicalName.slice(0, 300),
        slug: canonicalSlug,
        brand: product.brand?.slice(0, 120) ?? null,
        barcode: product.barcode?.slice(0, 40) ?? null,
        unit: product.unit?.slice(0, 20) ?? null,
        quantity: product.quantity,
        normalized_unit: product.normalizedUnit,
        normalized_quantity: product.normalizedQuantity,
        canonical_name: product.canonicalName.slice(0, 300),
        image_url: product.imageUrl,
        category_id: await this.inferCategoryId(product.categoryHint),
        last_seen_at: product.collectedAt,
        active: true,
      }, { onConflict: "slug" })
      .select("id")
      .single();

    if (insertError || !inserted) {
      throw new Error(`Falha ao criar produto: ${insertError?.message ?? "unknown"}`);
    }

    // 5. Registra alias
    if (marketId) {
      await this.supabase.from("product_aliases").upsert({
        product_id: inserted.id,
        market_id: marketId,
        raw_name: product.rawName,
      }, { onConflict: "product_id,market_id,raw_name" });
    }

    return { productId: inserted.id, isNew: true, matchedBy: "new" };
  }

  /** Busca market_id por slug (com cache simples) */
  private marketIdCache = new Map<string, string>();
  private async getMarketId(slug: string): Promise<string | null> {
    if (this.marketIdCache.has(slug)) return this.marketIdCache.get(slug)!;
    
    const { data } = await this.supabase
      .from("markets")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    
    if (data) {
      this.marketIdCache.set(slug, data.id);
      return data.id;
    }
    return null;
  }

  /** Infere category_id por hint (nome da categoria) */
  private async inferCategoryId(hint: string | null): Promise<string | null> {
    if (!hint) return null;
    
    const { data } = await this.supabase
      .from("categories")
      .select("id")
      .ilike("name", hint)
      .maybeSingle();
    
    return data?.id ?? null;
  }
}