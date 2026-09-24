import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import {
  biggestDrops,
  latestPricesBatch,
  nearHistoricLow,
  searchProducts,
  type DealRow,
  type LatestPrice,
  type ProductRow,
} from "./queries";

/**
 * Catálogo/estatísticas com unstable_cache (revalidate 300s).
 * Usa client anônimo sem cookies — leitura pública, RLS intacto.
 * Sem env configurado, retorna vazio (empty states cobrem).
 */
function configured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export const getCachedDeals = unstable_cache(
  async (): Promise<{ drops: DealRow[]; lows: DealRow[] }> => {
    if (!configured()) return { drops: [], lows: [] };
    const supabase = createPublicClient();
    const [drops, lows] = await Promise.all([
      biggestDrops(supabase),
      nearHistoricLow(supabase),
    ]);
    return { drops, lows };
  },
  ["catalog-deals"],
  { revalidate: 300, tags: ["catalog"] },
);

export const getCachedSearch = unstable_cache(
  async (
    q: string,
    city?: string,
  ): Promise<(ProductRow & { latest: LatestPrice[] })[]> => {
    if (!configured()) return [];
    return searchProducts(createPublicClient(), q, 20, city ?? undefined);
  },
  ["catalog-search"],
  { revalidate: 300, tags: ["catalog"] },
);

export const getCachedLatestBatch = unstable_cache(
  async (idsKey: string): Promise<Record<string, LatestPrice[]>> => {
    if (!configured()) return {};
    const ids = idsKey.split(",").filter(Boolean);
    const map = await latestPricesBatch(createPublicClient(), ids);
    return Object.fromEntries(map);
  },
  ["catalog-latest"],
  { revalidate: 300, tags: ["catalog"] },
);
