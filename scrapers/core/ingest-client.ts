import { createServiceRoleClient } from "../lib/supabase.js";
import type { NormalizedProduct } from "./provider.js";
import type { SupabaseClient } from "@supabase/supabase-js";

const SOURCE_IDS: Record<NormalizedProduct["source"], number> = {
  "site-jsonld": 1,
  graphql: 2,
  manual: 3,
  encarte: 4,
};

export interface IngestItem {
  product_name: string;
  brand: string | null;
  barcode: string | null;
  unit: string | null;
  quantity: number | null;
  price: number;
  promotional_price: number | null;
  market_slug: string;
  source_url: string | null;
  source: "site-jsonld" | "graphql" | "manual" | "encarte";
  collected_at: string;
  image_url: string | null;
  canonical_product_id: string; // FK para canonical_products
}

export interface IngestResult {
  ok: boolean;
  run_id: string;
  valid: number;
  ignored: number;
  created: number;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  errors: Array<{ error_type: string; message: string }>;
}

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
  return base || "produto";
}

interface MarketRow { id: string; slug: string }
interface RunRow { id: string }
interface ProductRow { id: string }
interface AliasRow { product_id: string }

export class IngestClient {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createServiceRoleClient();
  }

  /** Envia batch de itens direto no Supabase */
  async ingestBatch(items: IngestItem[]): Promise<IngestResult> {
    if (items.length === 0) {
      return { ok: true, run_id: "", valid: 0, ignored: 0, created: 0, status: "SUCCESS", errors: [] };
    }

    const started = Date.now();
    const slugs = [...new Set(items.map((i) => i.market_slug))];

    const { data: markets, error: marketsError } = await this.supabase
      .from("markets")
      .select("id, slug")
      .in("slug", slugs);
    if (marketsError) throw new Error(`Falha ao buscar mercados: ${marketsError.message}`);
    const marketBySlug = new Map((markets as MarketRow[]).map((m) => [m.slug, m.id]));

    const { data: run, error: runError } = await this.supabase
      .from("scrape_runs")
      .insert({ status: "PARTIAL", products_found: items.length })
      .select("id")
      .single();
    if (runError) throw new Error(`Falha ao registrar run: ${runError.message}`);
    const runId = (run as RunRow).id;

    let valid = 0;
    let ignored = 0;
    let created = 0;
    const errors: { product_url?: string; error_type: string; message: string }[] = [];

    for (const item of items) {
      const marketId = marketBySlug.get(item.market_slug);
      if (!marketId) {
        ignored++;
        errors.push({ error_type: "market_not_found", message: `Mercado desconhecido: ${item.market_slug}` });
        continue;
      }

      const canonicalProductId = item.canonical_product_id;

      // Busca ou cria produto market-specific (products) ligado ao canonical_product
      let productId: string | null = null;
      const { data: existingProduct } = await this.supabase
        .from("products")
        .select("id")
        .eq("normalized_id", canonicalProductId)
        .eq("market_id", marketId)
        .maybeSingle();
      
      if (existingProduct) {
        productId = (existingProduct as ProductRow).id;
        // Atualiza image_url se veio nova
        if (item.image_url) {
          await this.supabase
            .from("products")
            .update({ image_url: item.image_url, last_seen_at: item.collected_at })
            .eq("id", productId);
        }
      } else {
        // Cria novo produto market-specific
        const slug = slugify([item.brand, item.product_name].filter(Boolean).join(" "));
        const { data: inserted, error: insertError } = await this.supabase
          .from("products")
          .upsert(
            {
              name: item.product_name,
              slug,
              brand: item.brand ?? null,
              barcode: item.barcode ?? null,
              unit: item.unit ?? null,
              quantity: item.quantity ?? null,
              image_url: item.image_url ?? null,
              normalized_id: canonicalProductId,
              market_id: marketId,
              last_seen_at: item.collected_at,
              active: true,
            },
            { onConflict: "slug,market_id" },
          )
          .select("id")
          .single();
        if (insertError || !inserted) {
          ignored++;
          errors.push({
            product_url: item.source_url ?? undefined,
            error_type: "product_upsert_failed",
            message: insertError?.message ?? "Falha ao criar produto market-specific",
          });
          continue;
        }
        productId = (inserted as ProductRow).id;
        created++;
        
        // Registra alias
        await this.supabase.from("product_aliases").upsert(
          { product_id: canonicalProductId, market_id: marketId, raw_name: item.product_name, market_sku: item.barcode },
          { onConflict: "product_id,market_id,raw_name" },
        );
      }

      // Insere preço (pula se price <= 0 — encartes sem preço definido)
      if (item.price > 0) {
        const { error: priceError } = await this.supabase.from("prices").insert({
          product_id: productId,
          market_id: marketId,
          price: item.price,
          promotional_price: item.promotional_price ?? null,
          source_id: SOURCE_IDS[item.source],
          source_url: item.source_url ?? null,
          collected_at: item.collected_at,
        });
        if (priceError) {
          ignored++;
          errors.push({
            product_url: item.source_url ?? undefined,
            error_type: "price_insert_failed",
            message: priceError.message,
          });
          continue;
        }
      }

      valid++;
    }

    const status = valid === 0 ? "FAILED" : ignored === 0 ? "SUCCESS" : "PARTIAL";
    await this.supabase
      .from("scrape_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        products_valid: valid,
        products_ignored: ignored,
        products_new: created,
        products_updated: valid,
        error_summary: errors.length ? errors.slice(0, 5).map((e) => e.message).join(" | ") : null,
        duration_ms: Date.now() - started,
      })
      .eq("id", runId);

    if (errors.length) {
      await this.supabase.from("scrape_errors").insert(
        errors.slice(0, 100).map((e) => ({
          run_id: runId,
          product_url: e.product_url ?? null,
          error_type: e.error_type,
          message: e.message,
        })),
      );
    }

    return { ok: true, run_id: runId, valid, ignored, created, status, errors };
  }

  /** Converte NormalizedProduct + canonical_product_id → IngestItem */
  static toIngestItem(n: NormalizedProduct, canonicalProductId: string): IngestItem {
    return {
      product_name: n.rawName,
      brand: n.brand,
      barcode: n.barcode,
      unit: n.unit,
      quantity: n.quantity,
      price: n.price,
      promotional_price: n.promotionalPrice,
      market_slug: n.marketSlug,
      source_url: n.sourceUrl,
      source: n.source,
      collected_at: n.collectedAt,
      image_url: n.imageUrl,
      canonical_product_id: canonicalProductId,
    };
  }
}

/** Helper para criar client com env vars */
export function createIngestClient(): IngestClient {
  return new IngestClient();
}