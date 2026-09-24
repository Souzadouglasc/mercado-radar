import { z } from "zod";

// Re-export do contrato exato de lib/ingest/schema.ts para reuso no scraper.
// Não importar de lib/ aqui: scrapers rodam standalone via tsx (fora do bundle Next).
export const productPriceSchema = z.object({
  product_name: z.string().min(1).max(300),
  brand: z.string().max(120).nullish(),
  barcode: z.string().max(40).nullish(),
  unit: z.string().max(20).nullish(),
  quantity: z.number().positive().nullish(),
  price: z.number().positive(),
  promotional_price: z.number().positive().nullish(),
  market_slug: z.string().min(1).max(80),
  source_url: z.string().url().max(2000).nullish(),
  source: z.enum(["site-jsonld", "graphql", "manual", "encarte"]).default("site-jsonld"),
  collected_at: z.string().datetime({ offset: true }),
  image_url: z.string().url().max(2000).nullish(),
});

export type ProductPrice = z.infer<typeof productPriceSchema>;

export type UrlOutcome = { url: string; ok: boolean; error?: string };

export interface ScrapeResult {
  marketSlug: string;
  items: ProductPrice[];
  outcomes: UrlOutcome[];
  startedAt: string;
  finishedAt: string;
}

export interface RunStats {
  marketSlug: string;
  productsFound: number;
  ok: number;
  errors: number;
  errorRate: number;
  durationMs: number;
}

export function toRunStats(result: ScrapeResult): RunStats {
  const ok = result.outcomes.filter((o) => o.ok).length;
  const errors = result.outcomes.length - ok;
  return {
    marketSlug: result.marketSlug,
    productsFound: result.items.length,
    ok,
    errors,
    errorRate: result.outcomes.length ? errors / result.outcomes.length : 0,
    durationMs: Date.parse(result.finishedAt) - Date.parse(result.startedAt),
  };
}
