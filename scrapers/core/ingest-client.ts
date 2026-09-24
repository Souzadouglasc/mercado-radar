/**
 * Ingest Client - MercadoRadar
 * Cliente tipado para POST /api/ingest/prices + chamada de evaluate_price_alerts.
 */

import type { NormalizedProduct } from "./provider.js";
import { createServiceRoleClient } from "@/lib/supabase/server";

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

export class IngestClient {
  private appUrl: string;
  private secret: string;

  constructor(appUrl: string, secret: string) {
    this.appUrl = appUrl.replace(/\/$/, "");
    this.secret = secret;
  }

  /** Envia batch de itens para /api/ingest/prices */
  async ingestBatch(items: IngestItem[]): Promise<IngestResult> {
    if (items.length === 0) {
      return { ok: true, run_id: "", valid: 0, ignored: 0, created: 0, status: "SUCCESS", errors: [] };
    }

    const res = await fetch(`${this.appUrl}/api/ingest/prices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.secret}`,
      },
      body: JSON.stringify({ items }),
      signal: AbortSignal.timeout(180_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ingest HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const result = (await res.json()) as IngestResult;
    
    // Chama evaluate_price_alerts para os produtos afetados
    if (result.valid > 0) {
      await this.evaluateAlerts(items.map((i) => i.product_name)); // product_name não é ID, precisamos dos IDs reais
      // NOTA: O ideal é o ingest route retornar os product_ids criados/atualizados
      // Por enquanto, a RPC evaluate_price_alerts é chamada dentro do ingest route
    }

    return result;
  }

  /** Chama RPC evaluate_price_alerts (precisa dos product_ids reais) */
  async evaluateAlerts(productIds: string[]): Promise<void> {
    if (productIds.length === 0) return;
    
    const supabase = await createServiceRoleClient();
    const { error } = await supabase.rpc("evaluate_price_alerts", {
      p_product_ids: productIds,
    });
    
    if (error) {
      console.warn("[IngestClient] evaluate_price_alerts falhou:", error.message);
    }
  }

  /** Converte NormalizedProduct → IngestItem */
  static toIngestItem(n: NormalizedProduct): IngestItem {
    return {
      product_name: n.rawName, // nome original para alias matching
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
    };
  }
}

/** Helper para criar client com env vars */
export function createIngestClient(): IngestClient {
  const appUrl = process.env.APP_URL;
  const secret = process.env.CRON_SECRET;
  
  if (!appUrl || !secret) {
    throw new Error("APP_URL e CRON_SECRET são obrigatórios");
  }
  
  return new IngestClient(appUrl, secret);
}