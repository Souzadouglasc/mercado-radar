import type { SupabaseClient } from "@supabase/supabase-js";

export type Market = {
  id: string;
  name: string;
  slug: string;
  website_url: string | null;
  city: string | null;
  active: boolean;
};

export type LatestPrice = {
  product_id: string;
  market_id: string;
  price: number;
  promotional_price: number | null;
  collected_at: string;
  market: { id: string; name: string; slug: string };
};

export type ProductRow = {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  unit: string | null;
  quantity: number | null;
};

/** Busca produtos por nome/marca (ilike) com o último preço por mercado. */
export async function searchProducts(
  supabase: SupabaseClient,
  q: string,
  limit = 20,
): Promise<(ProductRow & { latest: LatestPrice[] })[]> {
  const term = q.trim().slice(0, 80);
  if (!term) return [];
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, slug, brand, unit, quantity")
    .eq("active", true)
    .or(`name.ilike.%${term}%,brand.ilike.%${term}%`)
    .order("name")
    .limit(limit);
  if (error || !products) return [];
  const rows = products as ProductRow[];
  const withPrices = await Promise.all(
    rows.map(async (p) => ({ ...p, latest: await latestPrices(supabase, p.id) })),
  );
  return withPrices;
}

/**
 * Último preço por mercado (1 query, sem N+1):
 * ordena por collected_at desc e mantém o primeiro de cada mercado no JS
 * (distinct on não é exposo via PostgREST; volume por produto é pequeno).
 */
export async function latestPrices(
  supabase: SupabaseClient,
  productId: string,
): Promise<LatestPrice[]> {
  const { data, error } = await supabase
    .from("prices")
    .select(
      "product_id, market_id, price, promotional_price, collected_at, market:markets(id, name, slug)",
    )
    .eq("product_id", productId)
    .order("collected_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  const seen = new Set<string>();
  const out: LatestPrice[] = [];
  for (const row of data as unknown as (Omit<LatestPrice, "market"> & {
    market: LatestPrice["market"] | LatestPrice["market"][];
  })[]) {
    if (seen.has(row.market_id)) continue;
    seen.add(row.market_id);
    const market = Array.isArray(row.market) ? row.market[0] : row.market;
    if (!market) continue;
    out.push({
      product_id: row.product_id,
      market_id: row.market_id,
      price: Number(row.price),
      promotional_price:
        row.promotional_price === null ? null : Number(row.promotional_price),
      collected_at: row.collected_at,
      market,
    });
  }
  return out;
}

export type ProductStats = {
  current: number;
  average: number;
  min: number;
  max: number;
  count: number;
  variation: number | null; // % vs. preço mais antigo da janela
  lastUpdate: string;
};

export type PricePoint = {
  price: number;
  promotional_price: number | null;
  collected_at: string;
  market: { id: string; name: string; slug: string };
};

export type HistoryRange = "7d" | "30d" | "90d" | "6m" | "1y";

export const HISTORY_RANGE_DAYS: Record<HistoryRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "6m": 182,
  "1y": 365,
};

/** Cores por mercado para o gráfico de histórico (1 cor por mercado). */
export const MARKET_COLORS: Record<string, string> = {
  fort: "#16a34a",
  koch: "#2563eb",
  brasil: "#ea580c",
  komprao: "#9333ea",
};

export function marketColor(slug: string, index: number): string {
  if (MARKET_COLORS[slug]) return MARKET_COLORS[slug];
  const fallback = ["#0d9488", "#e11d48", "#ca8a04", "#475569"];
  return fallback[index % fallback.length];
}

/**
 * Histórico de preços por produto+range. 1 fetch com limite (2000 pontos);
 * o downsample (> 300 pontos) é feito no JS pelo componente do gráfico.
 */
export async function priceHistory(
  supabase: SupabaseClient,
  productId: string,
  range: HistoryRange,
): Promise<PricePoint[]> {
  const since = new Date(
    Date.now() - HISTORY_RANGE_DAYS[range] * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabase
    .from("prices")
    .select(
      "price, promotional_price, collected_at, market:markets(id, name, slug)",
    )
    .eq("product_id", productId)
    .gte("collected_at", since)
    .order("collected_at", { ascending: true })
    .limit(2000);
  if (error || !data) return [];
  const out: PricePoint[] = [];
  for (const row of data as unknown as (Omit<PricePoint, "market"> & {
    market: PricePoint["market"] | PricePoint["market"][];
  })[]) {
    const market = Array.isArray(row.market) ? row.market[0] : row.market;
    if (!market) continue;
    out.push({
      price: Number(row.price),
      promotional_price:
        row.promotional_price === null ? null : Number(row.promotional_price),
      collected_at: row.collected_at,
      market,
    });
  }
  return out;
}

export type DealRow = ProductRow & {
  current: number;
  reference: number;
  dropPercent: number;
  marketName: string;
  marketSlug: string;
};

/**
 * Dashboard: usa últimos 200 produtos ativos com preços, calcula no JS
 * (1 query de produtos + N queries de preços limitadas; limite 5 cada).
 */
async function candidateProducts(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("products")
    .select("id, name, slug, brand, unit, quantity")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(60);
  return (data ?? []) as ProductRow[];
}

async function pricesWindow(
  supabase: SupabaseClient,
  productId: string,
  days: number,
  limit = 120,
): Promise<{ price: number; collected_at: string }[]> {
  const since = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabase
    .from("prices")
    .select("price, promotional_price, collected_at")
    .eq("product_id", productId)
    .gte("collected_at", since)
    .order("collected_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as { price: number | string; promotional_price: number | string | null; collected_at: string }[]).map(
    (r) => ({
      price: Number(r.promotional_price ?? r.price),
      collected_at: r.collected_at,
    }),
  );
}

/** "Maiores quedas": último preço caiu > 5% vs média 30d. Limite 5. */
export async function biggestDrops(
  supabase: SupabaseClient,
): Promise<DealRow[]> {
  const products = await candidateProducts(supabase);
  const deals: DealRow[] = [];
  for (const p of products) {
    const rows = await pricesWindow(supabase, p.id, 30);
    if (rows.length < 2) continue;
    const current = rows[0].price;
    const avg = rows.reduce((s, r) => s + r.price, 0) / rows.length;
    if (avg <= 0) continue;
    const drop = ((avg - current) / avg) * 100;
    if (drop <= 5) continue;
    const latest = await latestPrices(supabase, p.id);
    const cheapest =
      latest.length > 0
        ? latest.reduce((a, b) =>
            (a.promotional_price ?? a.price) <= (b.promotional_price ?? b.price)
              ? a
              : b,
          )
        : null;
    deals.push({
      ...p,
      current,
      reference: Math.round(avg * 100) / 100,
      dropPercent: Math.round(drop * 10) / 10,
      marketName: cheapest?.market.name ?? "—",
      marketSlug: cheapest?.market.slug ?? "",
    });
  }
  return deals.sort((a, b) => b.dropPercent - a.dropPercent).slice(0, 5);
}

/** "Perto do mínimo histórico": atual ≤ mínimo (janela 1 ano) × 1.05. Limite 5. */
export async function nearHistoricLow(
  supabase: SupabaseClient,
): Promise<DealRow[]> {
  const products = await candidateProducts(supabase);
  const deals: DealRow[] = [];
  for (const p of products) {
    const rows = await pricesWindow(supabase, p.id, 365, 300);
    if (rows.length < 2) continue;
    const current = rows[0].price;
    const min = Math.min(...rows.map((r) => r.price));
    if (current > min * 1.05) continue;
    const latest = await latestPrices(supabase, p.id);
    const cheapest =
      latest.length > 0
        ? latest.reduce((a, b) =>
            (a.promotional_price ?? a.price) <= (b.promotional_price ?? b.price)
              ? a
              : b,
          )
        : null;
    const over = min > 0 ? ((current - min) / min) * 100 : 0;
    deals.push({
      ...p,
      current,
      reference: min,
      dropPercent: Math.round(over * 10) / 10,
      marketName: cheapest?.market.name ?? "—",
      marketSlug: cheapest?.market.slug ?? "",
    });
  }
  return deals.sort((a, b) => a.dropPercent - b.dropPercent).slice(0, 5);
}

/** Estatísticas (atual, média, min, max, variação) via agregação no JS sobre a janela. */
export async function productStats(
  supabase: SupabaseClient,
  productId: string,
  limit = 200,
): Promise<ProductStats | null> {
  const { data, error } = await supabase
    .from("prices")
    .select("price, collected_at")
    .eq("product_id", productId)
    .order("collected_at", { ascending: false })
    .limit(limit);
  if (error || !data || data.length === 0) return null;
  const rows = (data as { price: number | string; collected_at: string }[]).map(
    (r) => ({ price: Number(r.price), collected_at: r.collected_at }),
  );
  const prices = rows.map((r) => r.price);
  const current = prices[0];
  const oldest = prices[prices.length - 1];
  const sum = prices.reduce((a, b) => a + b, 0);
  return {
    current,
    average: sum / prices.length,
    min: Math.min(...prices),
    max: Math.max(...prices),
    count: prices.length,
    variation: oldest ? ((current - oldest) / oldest) * 100 : null,
    lastUpdate: rows[0].collected_at,
  };
}
