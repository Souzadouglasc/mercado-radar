import assert from "node:assert/strict";
import test from "node:test";
import { mapVtexProducts } from "./index.js";

test("maps available VTEX SKU prices, promotions, EAN and product URLs", () => {
  const items = mapVtexProducts([
    {
      productId: "123",
      productName: "Café Melitta Tradicional 500g",
      brand: "Melitta",
      linkText: "cafe-melitta-500g",
      categories: ["/Mercearia/Cafés/"],
      items: [{
        itemId: "456",
        eans: ["7891021004567"],
        images: [{ imageUrl: "https://cdn.example.com/cafe.jpg" }],
        sellers: [{
          sellerId: "1",
          sellerDefault: true,
          commertialOffer: { Price: 24.9, ListPrice: 29.97, AvailableQuantity: 12 },
        }],
      }],
    },
    {
      productId: "out-of-stock",
      productName: "Leite indisponível",
      items: [{ itemId: "sku-2", sellers: [{ commertialOffer: { Price: 8, AvailableQuantity: 0 } }] }],
    },
  ], {
    marketSlug: "bistek",
    siteUrl: "https://www.bistek.com.br",
    collectedAt: "2026-09-27T12:00:00.000Z",
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].price, 29.97);
  assert.equal(items[0].promotionalPrice, 24.9);
  assert.equal(items[0].barcode, "7891021004567");
  assert.equal(items[0].sku, "456");
  assert.equal(items[0].source, "catalog-api");
  assert.equal(items[0].sourceUrl, "https://www.bistek.com.br/cafe-melitta-500g/p");
  assert.deepEqual({ quantity: items[0].quantity, unit: items[0].unit }, { quantity: 500, unit: "g" });
});

test("does not treat regular VTEX prices as promotional prices", () => {
  const [item] = mapVtexProducts([{
    productId: "789",
    productName: "Arroz 5kg",
    link: "/arroz-5kg/p",
    items: [{ itemId: "sku-9", sellers: [{ commertialOffer: { Price: 25.5, ListPrice: 25.5, AvailableQuantity: 4 } }] }],
  }], {
    marketSlug: "angeloni",
    siteUrl: "https://super.angeloni.com.br",
    collectedAt: "2026-09-27T12:00:00.000Z",
  });

  assert.equal(item.price, 25.5);
  assert.equal(item.promotionalPrice, null);
});
