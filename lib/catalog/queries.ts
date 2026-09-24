import type { SupabaseClient } from "@supabase/supabase-js";

export type Market = {
  id: string;
  name: string;
  slug: string;
  website_url: string | null;
  city: string | null;
  active: boolean;
};

export type CityFilter = string | null; // null = todas

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
  image_url: string | null;
};

type RpcLatestRow = {
  product_id: string;
  market_id: string;
  price: number | string;
  promotional_price: number | string | null;
  collected_at: string;
  market_name: string;
  market_slug: string;
};

function toLatest(row: RpcLatestRow): LatestPrice {
  return {
    product_id: row.product_id,
    market_id: row.market_id,
    price: Number(row.price),
    promotional_price:
      row.promotional_price === null ? null : Number(row.promotional_price),
    collected_at: row.collected_at,
    market: { id: row.market_id, name: row.market_name, slug: row.market_slug },
  };
}

/**
 * Último preço por mercado para N produtos em 1 round-trip
 * (RPC latest_prices_for_products — DISTINCT ON (product_id, market_id)).
 * Fallback para a query ordenada caso a migration 0003 ainda não tenha sido aplicada.
 * Opcional: filtra por cidade do mercado.
 */
export async function latestPricesBatch(
  supabase: SupabaseClient,
  productIds: string[],
  city?: CityFilter,
): Promise<Map<string, LatestPrice[]>> {
  const out = new Map<string, LatestPrice[]>();
  if (productIds.length === 0) return out;

  // Tenta RPC primeiro (sem filtro de cidade no RPC atual; fallback faz o filtro)
  const { data, error } = await supabase.rpc("latest_prices_for_products", {
    p_ids: productIds,
  });
  if (!error && data && !city) {
    for (const r of data as RpcLatestRow[]) {
      const list = out.get(r.product_id) ?? [];
      list.push(toLatest(r));
      out.set(r.product_id, list);
    }
    return out;
  }

  // Fallback: 1 query ordenada + dedup no JS (sem N+1), com filtro de cidade opcional
  let query = supabase
    .from("prices")
    .select(
      "product_id, market_id, price, promotional_price, collected_at, market:markets!inner(id, name, slug, city)",
    )
    .in("product_id", productIds)
    .eq("markets.active", true)
    .order("collected_at", { ascending: false })
    .limit(Math.min(500, productIds.length * 20));

  if (city) {
    query = query.eq("markets.city", city);
  }

  const { data: rows } = await query;
  const seen = new Set<string>();
  for (const row of (rows ?? []) as unknown as (Omit<LatestPrice, "market"> & {
    market: LatestPrice["market"] | LatestPrice["market"][];
  })[]) {
    const key = `${row.product_id}|${row.market_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const market = Array.isArray(row.market) ? row.market[0] : row.market;
    if (!market) continue;
    const list = out.get(row.product_id) ?? [];
    list.push({
      product_id: row.product_id,
      market_id: row.market_id,
      price: Number(row.price),
      promotional_price:
        row.promotional_price === null ? null : Number(row.promotional_price),
      collected_at: row.collected_at,
      market,
    });
    out.set(row.product_id, list);
  }
  return out;
}

/** Último preço por mercado (1 produto). Usa o batch — 1 round-trip. */
export async function latestPrices(
  supabase: SupabaseClient,
  productId: string,
): Promise<LatestPrice[]> {
  const batch = await latestPricesBatch(supabase, [productId]);
  return batch.get(productId) ?? [];
}

const PRODUCT_FIELDS = "id, name, slug, brand, unit, quantity, image_url";

/** Busca full-text pt-BR (RPC search_products_ft) + fallback ilike. Com filtro opcional por cidade. */
export async function searchProducts(
  supabase: SupabaseClient,
  q: string,
  limit = 20,
  city?: CityFilter,
): Promise<(ProductRow & { latest: LatestPrice[] })[]> {
  const term = q.trim().slice(0, 80);
  if (!term) return [];
  let rows: ProductRow[] = [];
  const { data: ft, error: ftError } = await supabase.rpc("search_products_ft", {
    p_term: term,
    p_limit: limit,
    p_city: city ?? null,
  });
  if (!ftError && ft) {
    rows = (ft as (ProductRow & { rank: number })[]).map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ rank, ...p }) => p,
    );
  } else {
    // Fallback: comportamento anterior (ilike) com filtro de cidade via join
    let query = supabase
      .from("products")
      .select(PRODUCT_FIELDS)
      .eq("active", true)
      .or(`name.ilike.%${term}%,brand.ilike.%${term}%`)
      .order("name")
      .limit(limit);
    if (city) {
      // Join com markets via prices para filtrar por cidade
      query = query.filter("id", "in", `(
        select distinct product_id from prices p
        join markets m on m.id = p.market_id
        where m.city = '${city.replace(/'/g, "''")}' and m.active
      )`);
    }
    const { data: products, error } = await query;
    if (error || !products) return [];
    rows = products as ProductRow[];
  }
  if (rows.length === 0) return [];
  const batch = await latestPricesBatch(
    supabase,
    rows.map((p) => p.id),
    city,
  );
  return rows.map((p) => ({ ...p, latest: batch.get(p.id) ?? [] }));
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
  fort: "#178a4c",
  koch: "#2563eb",
  brasil: "#c2620a",
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

async function candidateProducts(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(60);
  return (data ?? []) as ProductRow[];
}

type WindowRow = { productId: string; price: number; collected_at: string };

/** Janela de preços de N produtos em 1 query (elimina N+1 do dashboard). */
async function pricesWindowBatch(
  supabase: SupabaseClient,
  productIds: string[],
  days: number,
  perProduct = 120,
): Promise<Map<string, WindowRow[]>> {
  const out = new Map<string, WindowRow[]>();
  if (productIds.length === 0) return out;
  const since = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabase
    .from("prices")
    .select("product_id, price, promotional_price, collected_at")
    .in("product_id", productIds)
    .gte("collected_at", since)
    .order("collected_at", { ascending: false })
    .limit(Math.min(2000, productIds.length * perProduct));
  if (error || !data) return out;
  for (const r of data as {
    product_id: string;
    price: number | string;
    promotional_price: number | string | null;
    collected_at: string;
  }[]) {
    const list = out.get(r.product_id) ?? [];
    // collected_at desc já vem ordenado; mantém no máximo perProduct por produto.
    if (list.length >= perProduct) continue;
    list.push({
      productId: r.product_id,
      price: Number(r.promotional_price ?? r.price),
      collected_at: r.collected_at,
    });
    out.set(r.product_id, list);
  }
  return out;
}

function cheapestOf(latest: LatestPrice[]): LatestPrice | null {
  if (latest.length === 0) return null;
  return latest.reduce((a, b) =>
    (a.promotional_price ?? a.price) <= (b.promotional_price ?? b.price)
      ? a
      : b,
  );
}

/** "Maiores quedas": último preço caiu > 5% vs média 30d. Limite 5. */
export async function biggestDrops(
  supabase: SupabaseClient,
): Promise<DealRow[]> {
  const products = await candidateProducts(supabase);
  if (products.length === 0) return [];
  const ids = products.map((p) => p.id);
  const [windows, latestMap] = await Promise.all([
    pricesWindowBatch(supabase, ids, 30),
    latestPricesBatch(supabase, ids),
  ]);
  const deals: DealRow[] = [];
  for (const p of products) {
    const rows = windows.get(p.id) ?? [];
    if (rows.length < 2) continue;
    const current = rows[0].price;
    const avg = rows.reduce((s, r) => s + r.price, 0) / rows.length;
    if (avg <= 0) continue;
    const drop = ((avg - current) / avg) * 100;
    if (drop <= 5) continue;
    const cheapest = cheapestOf(latestMap.get(p.id) ?? []);
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
  if (products.length === 0) return [];
  const ids = products.map((p) => p.id);
  const [windows, latestMap] = await Promise.all([
    pricesWindowBatch(supabase, ids, 365, 300),
    latestPricesBatch(supabase, ids),
  ]);
  const deals: DealRow[] = [];
  for (const p of products) {
    const rows = windows.get(p.id) ?? [];
    if (rows.length < 2) continue;
    const current = rows[0].price;
    const min = Math.min(...rows.map((r) => r.price));
    if (current > min * 1.05) continue;
    const cheapest = cheapestOf(latestMap.get(p.id) ?? []);
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

/** 
 * Busca produtos por categoria + comparação de preço por unidade.
 * Retorna produtos agrupados por categoria com preço/unit normalizado (R$/kg, R$/L, R$/un).
 */
export type CategoryComparisonRow = ProductRow & {
  latest: LatestPrice[];
  pricePerUnit: {
    pricePerUnit: number;
    baseUnit: 'kg' | 'L' | 'un';
    label: string;
  } | null;
  cheapestMarket?: { slug: string; name: string; price: number; pricePerUnit: number };
};

export async function searchProductsByCategory(
  supabase: SupabaseClient,
  categoryId: string,
  limit = 50,
  city?: CityFilter,
): Promise<CategoryComparisonRow[]> {
  // Busca produtos da categoria
  const { data: products, error } = await supabase
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("category_id", categoryId)
    .eq("active", true)
    .order("name")
    .limit(limit);

  if (error || !products || products.length === 0) return [];

  const rows = products as ProductRow[];
  const batch = await latestPricesBatch(supabase, rows.map((p) => p.id), city);

  // Importa a função de preço por unidade
  const { pricePerUnitFromProduct } = await import("./unit-price");

  const result: CategoryComparisonRow[] = rows.map((p) => {
    const latest = batch.get(p.id) ?? [];
    const up = pricePerUnitFromProduct(latest[0]?.price ?? 0, p);
    
    // Encontra o mercado mais barato (considerando preço promocional)
    let cheapestMarket: CategoryComparisonRow['cheapestMarket'] = undefined;
    if (latest.length > 0) {
      const cheapest = latest.reduce((a, b) => {
        const pa = a.promotional_price ?? a.price;
        const pb = b.promotional_price ?? b.price;
        return pa <= pb ? a : b;
      });
      const cheapestUp = pricePerUnitFromProduct(cheapest.promotional_price ?? cheapest.price, p);
      cheapestMarket = {
        slug: cheapest.market.slug,
        name: cheapest.market.name,
        price: cheapest.promotional_price ?? cheapest.price,
        pricePerUnit: cheapestUp?.pricePerUnit ?? 0,
      };
    }

    return {
      ...p,
      latest,
      pricePerUnit: up,
      cheapestMarket,
    };
  });

  // Ordena por preço por unidade (menor primeiro) onde disponível
  return result.sort((a, b) => {
    const ap = a.pricePerUnit?.pricePerUnit ?? Infinity;
    const bp = b.pricePerUnit?.pricePerUnit ?? Infinity;
    return ap - bp;
  });
}

/** Lista todas as categorias ativas */
export async function getCategories(
  supabase: SupabaseClient,
): Promise<{ id: string; name: string; slug: string; parent_id: string | null }[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, parent_id")
    .eq("active", true)
    .order("name");
  if (error || !data) return [];
  return data as { id: string; name: string; slug: string; parent_id: string | null }[];
}
