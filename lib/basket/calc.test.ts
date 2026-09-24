import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bestSingleMarket,
  savingsVsSingleMarket,
  splitPurchase,
  totalsPerMarket,
  type BasketItem,
  type MarketInfo,
  type PriceEntry,
} from "./calc.ts";

const markets: MarketInfo[] = [
  { marketId: "m-fort", marketName: "Fort Atacadista", marketSlug: "fort" },
  { marketId: "m-koch", marketName: "SuperKoch", marketSlug: "koch" },
];

const items: BasketItem[] = [
  { productId: "p-arroz", productName: "Arroz 5kg", productSlug: "arroz-5kg", quantity: 2 },
  { productId: "p-feijao", productName: "Feijão 1kg", productSlug: "feijao-1kg", quantity: 3 },
];

const prices: PriceEntry[] = [
  { productId: "p-arroz", marketId: "m-fort", marketName: "Fort Atacadista", marketSlug: "fort", price: 20 },
  { productId: "p-arroz", marketId: "m-koch", marketName: "SuperKoch", marketSlug: "koch", price: 22 },
  { productId: "p-feijao", marketId: "m-fort", marketName: "Fort Atacadista", marketSlug: "fort", price: 8 },
  { productId: "p-feijao", marketId: "m-koch", marketName: "SuperKoch", marketSlug: "koch", price: 7 },
];

describe("totalsPerMarket", () => {
  it("soma quantidade × último preço por mercado", () => {
    const totals = totalsPerMarket(items, prices, markets);
    assert.equal(totals[0].total, 2 * 20 + 3 * 8); // Fort: 64
    assert.equal(totals[1].total, 2 * 22 + 3 * 7); // Koch: 65
    assert.equal(totals[0].availableCount, 2);
    assert.deepEqual(totals[0].unavailableItems, []);
  });

  it("exclui item sem preço do total e marca indisponível", () => {
    const partial: PriceEntry[] = prices.filter(
      (p) => !(p.productId === "p-feijao" && p.marketId === "m-koch"),
    );
    const totals = totalsPerMarket(items, partial, markets);
    const koch = totals[1];
    assert.equal(koch.total, 2 * 22); // só arroz
    assert.equal(koch.availableCount, 1);
    assert.deepEqual(koch.unavailableItems, ["Feijão 1kg"]);
  });

  it("cesta vazia totaliza zero", () => {
    const totals = totalsPerMarket([], prices, markets);
    assert.equal(totals[0].total, 0);
    assert.equal(totals[0].availableCount, 0);
  });
});

describe("bestSingleMarket", () => {
  it("escolhe o menor total", () => {
    const totals = totalsPerMarket(items, prices, markets);
    assert.equal(bestSingleMarket(totals)?.marketSlug, "fort");
  });

  it("retorna null sem nenhum item disponível", () => {
    const totals = totalsPerMarket(items, [], markets);
    assert.equal(bestSingleMarket(totals), null);
  });
});

describe("splitPurchase", () => {
  it("pega o menor preço de cada item e agrupa por mercado", () => {
    const split = splitPurchase(items, prices);
    // arroz no Fort (20), feijão no Koch (7)
    assert.equal(split.total, 2 * 20 + 3 * 7); // 61
    assert.equal(split.byMarket.length, 2);
    assert.deepEqual(split.uncoveredItems, []);
    const fort = split.byMarket.find((g) => g.marketSlug === "fort")!;
    assert.equal(fort.subtotal, 40);
    assert.equal(fort.items[0].productId, "p-arroz");
  });

  it("itens sem preço em nenhum mercado ficam descobertos", () => {
    const withExtra: BasketItem[] = [
      ...items,
      { productId: "p-azeite", productName: "Azeite", productSlug: "azeite", quantity: 1 },
    ];
    const split = splitPurchase(withExtra, prices);
    assert.deepEqual(split.uncoveredItems, ["Azeite"]);
    assert.equal(split.total, 61);
  });
});

describe("savingsVsSingleMarket", () => {
  it("calcula economia em R$ e %", () => {
    const s = savingsVsSingleMarket(61, 64);
    assert.equal(s.amount, 3);
    assert.equal(s.percent, 4.69);
  });

  it("percent null quando base é zero", () => {
    assert.equal(savingsVsSingleMarket(0, 0).percent, null);
  });
});
