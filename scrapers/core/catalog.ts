/**
 * Product Catalog - MercadoRadar
 * Responsável por match/criação de produtos no catálogo normalizado.
 * Prioridade: EAN → alias (market+raw_name) → canonical_name fuzzy (v2) → novo produto.
 * Usa tabela canonical_products (nova arquitetura migration 0008).
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

interface CanonicalProductRow {
  id: string;
  quantity: number | null;
  unit: string | null;
  normalized_quantity: number | null;
  normalized_unit: "kg" | "L" | "un" | null;
}

function normalizedPack(
  quantity: number | null | undefined,
  unit: string | null | undefined,
  normalizedQuantity: number | null | undefined,
  normalizedUnit: "kg" | "L" | "un" | null | undefined,
): string | null {
  if (normalizedQuantity != null && normalizedUnit) {
    const stableQuantity = Number(normalizedQuantity.toFixed(6));
    return `${normalizedUnit}:${stableQuantity}`;
  }

  if (quantity == null || !unit) return null;
  const normalizedUnitName = unit.toLocaleLowerCase("pt-BR").trim();
  const baseUnit = ["g", "gr", "grama", "gramas", "kg", "quilograma", "quilogramas"].includes(normalizedUnitName)
    ? "kg"
    : ["ml", "mililitro", "mililitros", "l", "litro", "litros"].includes(normalizedUnitName)
      ? "L"
      : ["un", "unid", "unidade", "unidades", "pct", "peca", "peça", "pecas", "peças", "pc", "pcs", "cx", "caixa", "pacote", "dz", "duzia", "dúzia"].includes(normalizedUnitName)
        ? "un"
        : null;
  if (!baseUnit) return `${normalizedUnitName}:${Number(quantity.toFixed(6))}`;

  const baseQuantity = baseUnit === "kg" && ["g", "gr", "grama", "gramas"].includes(normalizedUnitName)
    ? quantity / 1000
    : baseUnit === "L" && ["ml", "mililitro", "mililitros"].includes(normalizedUnitName)
      ? quantity / 1000
      : quantity;
  return `${baseUnit}:${Number(baseQuantity.toFixed(6))}`;
}

/** Tamanhos distintos nunca podem apontar para o mesmo produto canônico. */
export function sameCanonicalPack(
  canonical: Pick<CanonicalProductRow, "quantity" | "unit" | "normalized_quantity" | "normalized_unit">,
  product: Pick<NormalizedProductForCatalog, "quantity" | "unit" | "normalizedQuantity" | "normalizedUnit">,
): boolean {
  return normalizedPack(
    canonical.quantity,
    canonical.unit,
    canonical.normalized_quantity,
    canonical.normalized_unit,
  ) === normalizedPack(
    product.quantity,
    product.unit,
    product.normalizedQuantity,
    product.normalizedUnit,
  );
}

function slugWithPack(baseSlug: string, pack: string | null): string {
  if (!pack) return baseSlug;
  const suffix = slugify(pack);
  return `${baseSlug.slice(0, Math.max(1, 79 - suffix.length))}-${suffix}`;
}

export class ProductCatalog {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Match ou cria produto no catálogo normalizado (canonical_products).
   * Retorna productId (canonical_products.id) + metadados de como foi matchado.
   */
  async matchOrCreate(product: NormalizedProductForCatalog): Promise<ProductRef> {
    // 1. Tenta EAN/GTIN (exato) em canonical_products
    if (product.barcode) {
      const { data, error } = await this.supabase
        .from("canonical_products")
        .select("id")
        .eq("barcode", product.barcode)
        .maybeSingle();
      
      if (!error && data) {
        const { data: canonical } = await this.supabase
          .from("canonical_products")
          .select("id, quantity, unit, normalized_quantity, normalized_unit")
          .eq("id", data.id)
          .maybeSingle();

        if (canonical && sameCanonicalPack(canonical as CanonicalProductRow, product)) {
          await this.supabase
            .from("canonical_products")
            .update({ updated_at: product.collectedAt })
            .eq("id", data.id);
          return { productId: data.id, isNew: false, matchedBy: "ean" };
        }
      }
    }

    // 2. Tenta nome canônico exato (via slug) em canonical_products
    const canonicalSlug = slugify(product.canonicalName);
    const productPack = normalizedPack(
      product.quantity,
      product.unit,
      product.normalizedQuantity,
      product.normalizedUnit,
    );
    const candidateSlugs = [...new Set([
      canonicalSlug,
      slugWithPack(canonicalSlug, productPack),
    ])];

    let slugCollision = false;
    for (const candidateSlug of candidateSlugs) {
      const { data: byCanonical } = await this.supabase
        .from("canonical_products")
        .select("id, quantity, unit, normalized_quantity, normalized_unit")
        .eq("slug", candidateSlug)
        .maybeSingle();

      if (!byCanonical) continue;
      if (!sameCanonicalPack(byCanonical as CanonicalProductRow, product)) {
        slugCollision = true;
        continue;
      }
      await this.supabase
        .from("canonical_products")
        .update({ updated_at: product.collectedAt })
        .eq("id", byCanonical.id);
      return { productId: byCanonical.id, isNew: false, matchedBy: "canonical" };
    }

    const { data: fuzzyCanonicalId, error: fuzzyMatchError } = await this.supabase.rpc(
      "match_canonical_product",
      {
        p_canonical_name: product.canonicalName,
        p_brand: product.brand,
        p_normalized_quantity: product.normalizedQuantity,
        p_normalized_unit: product.normalizedUnit,
      },
    );
    if (fuzzyMatchError) {
      throw new Error(`Falha ao buscar correspondência segura de catálogo: ${fuzzyMatchError.message}`);
    }
    if (typeof fuzzyCanonicalId === "string") {
      await this.supabase
        .from("canonical_products")
        .update({ updated_at: product.collectedAt })
        .eq("id", fuzzyCanonicalId);
      return { productId: fuzzyCanonicalId, isNew: false, matchedBy: "canonical" };
    }

    // 4. Tenta alias (market + raw_name) por último. Assim, um alias antigo
    // não impede uma correspondência segura entre mercados diferentes.
    const marketId = await this.getMarketId(product.marketSlug);
    if (marketId) {
      const { data: alias } = await this.supabase
        .from("product_aliases")
        .select("canonical_id")
        .eq("market_id", marketId)
        .eq("raw_name", product.rawName)
        .not("canonical_id", "is", null)
        .limit(1)
        .maybeSingle();

      if (alias?.canonical_id) {
        const { data: canonical } = await this.supabase
          .from("canonical_products")
          .select("id, quantity, unit, normalized_quantity, normalized_unit")
          .eq("id", alias.canonical_id)
          .maybeSingle();

        if (canonical && sameCanonicalPack(canonical as CanonicalProductRow, product)) {
          await this.supabase
            .from("canonical_products")
            .update({ updated_at: product.collectedAt })
            .eq("id", alias.canonical_id);
          return { productId: alias.canonical_id, isNew: false, matchedBy: "alias" };
        }
      }
    }

    const storageSlug = productPack
      ? slugWithPack(canonicalSlug, productPack)
      : slugCollision
        ? slugWithPack(canonicalSlug, "unknown-pack")
        : canonicalSlug;

    // 5. Cria novo canonical_product
    let categoryId: string | null = null;
    if (product.categoryHint) {
      const { data } = await this.supabase
        .from("categories")
        .select("id")
        .ilike("name", product.categoryHint)
        .maybeSingle();
      categoryId = data?.id ?? null;
    }

    const { data: inserted, error: insertError } = await this.supabase
      .from("canonical_products")
      .upsert({
        canonical_name: product.canonicalName.slice(0, 300),
        slug: storageSlug,
        brand: product.brand?.slice(0, 120) ?? null,
        barcode: product.barcode?.slice(0, 40) ?? null,
        unit: product.unit?.slice(0, 20) ?? null,
        quantity: product.quantity,
        normalized_unit: product.normalizedUnit,
        normalized_quantity: product.normalizedQuantity,
        image_url: product.imageUrl,
        category_id: categoryId,
      }, { onConflict: "slug" })
      .select("id")
      .single();

    if (insertError || !inserted) {
      throw new Error(`Falha ao criar canonical_product: ${insertError?.message ?? "unknown"}`);
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

