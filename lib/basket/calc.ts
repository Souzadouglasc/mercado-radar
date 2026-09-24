// Cálculo da cesta de compras — puro, sem dependências (testável com node:test).
// Preço efetivo = promocional ?? cheio; null = indisponível naquele mercado.

export type BasketItem = {
  productId: string;
  productName: string;
  productSlug: string;
  quantity: number;
};

export type PriceEntry = {
  productId: string;
  marketId: string;
  marketName: string;
  marketSlug: string;
  price: number | null;
};

export type MarketInfo = {
  marketId: string;
  marketName: string;
  marketSlug: string;
};

export type MarketTotal = MarketInfo & {
  total: number;
  availableCount: number;
  unavailableItems: string[];
};

export type SplitLine = {
  productId: string;
  productName: string;
  productSlug: string;
  quantity: number;
  marketId: string;
  marketName: string;
  marketSlug: string;
  unitPrice: number;
  lineTotal: number;
};

export type SplitGroup = MarketInfo & {
  items: SplitLine[];
  subtotal: number;
};

export type SplitResult = {
  lines: SplitLine[];
  byMarket: SplitGroup[];
  total: number;
  uncoveredItems: string[];
};

/**
 * Total da cesta por mercado. Itens sem preço num mercado são excluídos
 * do total desse mercado e listados em `unavailableItems`.
 */
export function totalsPerMarket(
  items: BasketItem[],
  prices: PriceEntry[],
  markets: MarketInfo[],
): MarketTotal[] {
  const byMarketProduct = new Map<string, number | null>();
  for (const p of prices) {
    byMarketProduct.set(`${p.marketId}|${p.productId}`, p.price);
  }
  return markets.map((m) => {
    let total = 0;
    let availableCount = 0;
    const unavailableItems: string[] = [];
    for (const item of items) {
      const price = byMarketProduct.get(`${m.marketId}|${item.productId}`);
      if (price === undefined || price === null) {
        unavailableItems.push(item.productName);
        continue;
      }
      total += price * item.quantity;
      availableCount += 1;
    }
    return { ...m, total: round2(total), availableCount, unavailableItems };
  });
}

/** Menor total entre mercados (ignora mercados sem nenhum item disponível). */
export function bestSingleMarket(totals: MarketTotal[]): MarketTotal | null {
  const eligible = totals.filter((t) => t.availableCount > 0);
  if (eligible.length === 0) return null;
  return eligible.reduce((a, b) => (a.total <= b.total ? a : b));
}

/**
 * Compra dividida: cada item no menor preço entre mercados.
 * Itens sem preço em nenhum mercado vão para `uncoveredItems`.
 */
export function splitPurchase(
  items: BasketItem[],
  prices: PriceEntry[],
): SplitResult {
  const lines: SplitLine[] = [];
  const uncoveredItems: string[] = [];

  for (const item of items) {
    const offers = prices.filter(
      (p): p is PriceEntry & { price: number } =>
        p.productId === item.productId && p.price !== null,
    );
    if (offers.length === 0) {
      uncoveredItems.push(item.productName);
      continue;
    }
    const best = offers.reduce((a, b) => (a.price <= b.price ? a : b));
    lines.push({
      productId: item.productId,
      productName: item.productName,
      productSlug: item.productSlug,
      quantity: item.quantity,
      marketId: best.marketId,
      marketName: best.marketName,
      marketSlug: best.marketSlug,
      unitPrice: best.price,
      lineTotal: round2(best.price * item.quantity),
    });
  }

  const groups = new Map<string, SplitGroup>();
  for (const line of lines) {
    const g = groups.get(line.marketId) ?? {
      marketId: line.marketId,
      marketName: line.marketName,
      marketSlug: line.marketSlug,
      items: [],
      subtotal: 0,
    };
    g.items.push(line);
    g.subtotal = round2(g.subtotal + line.lineTotal);
    groups.set(line.marketId, g);
  }

  const byMarket = [...groups.values()].sort((a, b) => b.subtotal - a.subtotal);
  return {
    lines,
    byMarket,
    total: round2(lines.reduce((s, l) => s + l.lineTotal, 0)),
    uncoveredItems,
  };
}

export function savingsVsSingleMarket(
  splitTotal: number,
  bestSingleTotal: number,
): { amount: number; percent: number | null } {
  const amount = round2(bestSingleTotal - splitTotal);
  const percent =
    bestSingleTotal > 0 ? round2((amount / bestSingleTotal) * 100) : null;
  return { amount, percent };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
