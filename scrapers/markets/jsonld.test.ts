import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractJsonLdProduct, toProductPrice } from "./jsonld.js";

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(dir, "__fixtures__", "fort-product.html"), "utf8");

describe("extractJsonLdProduct (fixture real Fort)", () => {
  it("extrai Product com price/sku/brand", () => {
    const p = extractJsonLdProduct(fixture);
    assert.ok(p);
    assert.equal(p.name, "PANETTONE STA EDWIGES 400G LARANJA C/GTAS CHOC.");
    assert.equal(p.sku, "8199867");
    assert.equal(p.brand, "Santa Edwiges");
    assert.equal(String(p.offers?.price), "49.90");
  });
  it("retorna null sem Product", () => {
    assert.equal(extractJsonLdProduct("<html><body>oi</body></html>"), null);
  });
  it("ignora bloco JSON inválido", () => {
    assert.equal(
      extractJsonLdProduct(
        '<script type="application/ld+json">{invalido</script><html></html>',
      ),
      null,
    );
  });
});

describe("toProductPrice", () => {
  it("monta ProductPrice compatível com o ingest", () => {
    const p = extractJsonLdProduct(fixture);
    assert.ok(p);
    const item = toProductPrice({
      jsonld: p,
      marketSlug: "fort-atacadista",
      sourceUrl: "https://fortatacadista.com.br/produtos/8199867/x",
      collectedAt: "2026-09-24T00:00:00.000Z",
    });
    assert.ok(item);
    assert.equal(item.price, 49.9);
    assert.equal(item.quantity, 400);
    assert.equal(item.unit, "g");
    assert.equal(item.source, "site-jsonld");
    assert.equal(item.market_slug, "fort-atacadista");
  });
  it("null sem preço", () => {
    assert.equal(
      toProductPrice({
        jsonld: { name: "X 1kg", offers: {} },
        marketSlug: "fort-atacadista",
        sourceUrl: "https://fortatacadista.com.br/produtos/1/x",
        collectedAt: "2026-09-24T00:00:00.000Z",
      }),
      null,
    );
  });
});
