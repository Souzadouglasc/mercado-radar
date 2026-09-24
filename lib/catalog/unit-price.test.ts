/**
 * Testes para pricePerUnit — node:test (sem dependências externas)
 */
import { test, describe } from "node:test";
import assert from "node:assert";
import {
  pricePerUnit,
  pricePerUnitFromProduct,
  normalizeUnit,
  toBaseQuantity,
} from "./unit-price.js";

describe("normalizeUnit", () => {
  test("peso -> kg", () => {
    assert.strictEqual(normalizeUnit("g"), "kg");
    assert.strictEqual(normalizeUnit("gr"), "kg");
    assert.strictEqual(normalizeUnit("grama"), "kg");
    assert.strictEqual(normalizeUnit("gramas"), "kg");
    assert.strictEqual(normalizeUnit("kg"), "kg");
    assert.strictEqual(normalizeUnit("quilograma"), "kg");
    assert.strictEqual(normalizeUnit("quilogramas"), "kg");
  });

  test("volume -> L", () => {
    assert.strictEqual(normalizeUnit("ml"), "L");
    assert.strictEqual(normalizeUnit("mililitro"), "L");
    assert.strictEqual(normalizeUnit("mililitros"), "L");
    assert.strictEqual(normalizeUnit("l"), "L");
    assert.strictEqual(normalizeUnit("litro"), "L");
    assert.strictEqual(normalizeUnit("litros"), "L");
  });

  test("unidade -> un", () => {
    assert.strictEqual(normalizeUnit("un"), "un");
    assert.strictEqual(normalizeUnit("unid"), "un");
    assert.strictEqual(normalizeUnit("unidade"), "un");
    assert.strictEqual(normalizeUnit("unidades"), "un");
    assert.strictEqual(normalizeUnit("pct"), "un");
    assert.strictEqual(normalizeUnit("peca"), "un");
    assert.strictEqual(normalizeUnit("peça"), "un");
    assert.strictEqual(normalizeUnit("pecas"), "un");
    assert.strictEqual(normalizeUnit("peças"), "un");
    assert.strictEqual(normalizeUnit("pc"), "un");
    assert.strictEqual(normalizeUnit("pcs"), "un");
    assert.strictEqual(normalizeUnit("cx"), "un");
    assert.strictEqual(normalizeUnit("caixa"), "un");
    assert.strictEqual(normalizeUnit("pacote"), "un");
  });

  test("unidade desconhecida -> null", () => {
    assert.strictEqual(normalizeUnit("xyz"), null);
    assert.strictEqual(normalizeUnit(""), null);
    assert.strictEqual(normalizeUnit(null), null);
  });
});

describe("toBaseQuantity", () => {
  test("g -> kg (divide por 1000)", () => {
    assert.strictEqual(toBaseQuantity(500, "g"), 0.5);
    assert.strictEqual(toBaseQuantity(1000, "g"), 1);
    assert.strictEqual(toBaseQuantity(250, "grama"), 0.25);
  });

  test("kg -> kg (mantém)", () => {
    assert.strictEqual(toBaseQuantity(1, "kg"), 1);
    assert.strictEqual(toBaseQuantity(2.5, "quilograma"), 2.5);
  });

  test("ml -> L (divide por 1000)", () => {
    assert.strictEqual(toBaseQuantity(500, "ml"), 0.5);
    assert.strictEqual(toBaseQuantity(1000, "ml"), 1);
    assert.strictEqual(toBaseQuantity(250, "mililitro"), 0.25);
  });

  test("L -> L (mantém)", () => {
    assert.strictEqual(toBaseQuantity(1, "L"), 1);
    assert.strictEqual(toBaseQuantity(1.5, "litro"), 1.5);
  });

  test("un -> un (mantém)", () => {
    assert.strictEqual(toBaseQuantity(1, "un"), 1);
    assert.strictEqual(toBaseQuantity(6, "pct"), 6);
    assert.strictEqual(toBaseQuantity(12, "unidade"), 12);
  });

  test("quantidade inválida -> null", () => {
    assert.strictEqual(toBaseQuantity(null, "g"), null);
    assert.strictEqual(toBaseQuantity(0, "g"), null);
    assert.strictEqual(toBaseQuantity(-1, "kg"), null);
    assert.strictEqual(toBaseQuantity(1, "xyz"), null);
    assert.strictEqual(toBaseQuantity(1, null), null);
  });
});

describe("pricePerUnit", () => {
  test("peso: 500g por R$ 10 -> R$ 20,00/kg", () => {
    const result = pricePerUnit(10, 500, "g");
    assert.ok(result !== null);
    assert.strictEqual(result?.baseUnit, "kg");
    assert.ok(Math.abs((result?.pricePerUnit ?? 0) - 20) < 0.01);
    assert.ok(result?.label.includes("20,00"));
    assert.ok(result?.label.includes("/kg"));
  });

  test("peso: 1kg por R$ 15 -> R$ 15,00/kg", () => {
    const result = pricePerUnit(15, 1, "kg");
    assert.ok(result !== null);
    assert.strictEqual(result?.baseUnit, "kg");
    assert.ok(Math.abs((result?.pricePerUnit ?? 0) - 15) < 0.01);
  });

  test("volume: 500ml por R$ 5 -> R$ 10,00/L", () => {
    const result = pricePerUnit(5, 500, "ml");
    assert.ok(result !== null);
    assert.strictEqual(result?.baseUnit, "L");
    assert.ok(Math.abs((result?.pricePerUnit ?? 0) - 10) < 0.01);
    assert.ok(result?.label.includes("10,00"));
    assert.ok(result?.label.includes("/L"));
  });

  test("volume: 1.5L por R$ 12 -> R$ 8,00/L", () => {
    const result = pricePerUnit(12, 1.5, "L");
    assert.ok(result !== null);
    assert.strictEqual(result?.baseUnit, "L");
    assert.ok(Math.abs((result?.pricePerUnit ?? 0) - 8) < 0.01);
  });

  test("unidade: 6 unidades por R$ 18 -> R$ 3,00/un", () => {
    const result = pricePerUnit(18, 6, "un");
    assert.ok(result !== null);
    assert.strictEqual(result?.baseUnit, "un");
    assert.ok(Math.abs((result?.pricePerUnit ?? 0) - 3) < 0.01);
    assert.ok(result?.label.includes("3,00"));
    assert.ok(result?.label.includes("/un"));
  });

  test("pct: 12 peças por R$ 24 -> R$ 2,00/un", () => {
    const result = pricePerUnit(24, 12, "pct");
    assert.ok(result !== null);
    assert.strictEqual(result?.baseUnit, "un");
    assert.ok(Math.abs((result?.pricePerUnit ?? 0) - 2) < 0.01);
  });

  test("preço inválido -> null", () => {
    assert.strictEqual(pricePerUnit(0, 500, "g"), null);
    assert.strictEqual(pricePerUnit(-10, 500, "g"), null);
    assert.strictEqual(pricePerUnit(null as any, 500, "g"), null);
  });

  test("quantidade/unidade inválida -> null", () => {
    assert.strictEqual(pricePerUnit(10, null, "g"), null);
    assert.strictEqual(pricePerUnit(10, 0, "g"), null);
    assert.strictEqual(pricePerUnit(10, 500, null), null);
    assert.strictEqual(pricePerUnit(10, 500, "xyz"), null);
  });

  test("case insensitive", () => {
    const r1 = pricePerUnit(10, 500, "G");
    const r2 = pricePerUnit(10, 500, "g");
    assert.ok(r1 !== null && r2 !== null);
    assert.strictEqual(r1?.pricePerUnit, r2?.pricePerUnit);
  });
});

describe("pricePerUnitFromProduct", () => {
  test("usa quantity/unit do produto", () => {
    const product = { quantity: 500, unit: "g" };
    const result = pricePerUnitFromProduct(10, product);
    assert.ok(result !== null);
    assert.strictEqual(result?.baseUnit, "kg");
    assert.ok(Math.abs((result?.pricePerUnit ?? 0) - 20) < 0.01);
  });

  test("produto sem quantity/unit -> null", () => {
    const product = { quantity: null, unit: null };
    assert.strictEqual(pricePerUnitFromProduct(10, product), null);
  });
});