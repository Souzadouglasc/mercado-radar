import { z } from "zod";

// ProductPrice do Passo 3 do docs/FASE-0-arquitetura.md (+ source opcional + image_url)
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

export const ingestBodySchema = z.object({
  items: z.array(productPriceSchema).min(1).max(1000),
});

export type ProductPrice = z.infer<typeof productPriceSchema>;
