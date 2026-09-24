import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeName, parsePrice, slugify } from "./normalize.js";

describe("normalizeName", () => {
  it("ARROZ TIO URBANO 5KG → canonical + qty/unit", () => {
    assert.deepEqual(normalizeName("ARROZ TIO URBANO 5KG"), {
      canonical: "arroz tio urbano",
      quantity: 5,
      unit: "kg",
    });
  });
  it("separa 1L com espaço", () => {
    assert.deepEqual(normalizeName("Leite Integral 1 L"), {
      canonical: "leite integral",
      quantity: 1,
      unit: "l",
    });
  });
  it("500g minúsculo + acentos", () => {
    assert.deepEqual(normalizeName("AÇÚCAR Cristal 500g"), {
      canonical: "acucar cristal",
      quantity: 500,
      unit: "g",
    });
  });
  it("20un", () => {
    assert.deepEqual(normalizeName("Ovo Branco 20un"), {
      canonical: "ovo branco",
      quantity: 20,
      unit: "un",
    });
  });
  it("decimal com vírgula 1,5L", () => {
    assert.deepEqual(normalizeName("Refrigerante 1,5L"), {
      canonical: "refrigerante",
      quantity: 1.5,
      unit: "l",
    });
  });
  it("250ml no meio do nome", () => {
    assert.deepEqual(normalizeName("Mamadeira Lolly 250ml Silic"), {
      canonical: "mamadeira lolly silic",
      quantity: 250,
      unit: "ml",
    });
  });
  it("sem quantidade", () => {
    assert.deepEqual(normalizeName("Café Torrado e Moído"), {
      canonical: "cafe torrado e moido",
      quantity: null,
      unit: null,
    });
  });
  it("colapsa espaços", () => {
    assert.deepEqual(normalizeName("  ARROZ   Tio  Urbano  "), {
      canonical: "arroz tio urbano",
      quantity: null,
      unit: null,
    });
  });
});

describe("slugify", () => {
  it("acentos + espaços", () => {
    assert.equal(slugify("Açúcar Cristal 5kg"), "acucar-cristal-5kg");
  });
  it("vazio → produto", () => {
    assert.equal(slugify(""), "produto");
  });
});

describe("parsePrice", () => {
  it("pt-BR R$ 1.234,56", () => {
    assert.equal(parsePrice("R$ 1.234,56"), 1234.56);
  });
  it("49.90", () => {
    assert.equal(parsePrice("49.90"), 49.9);
  });
  it("4,49", () => {
    assert.equal(parsePrice("4,49"), 4.49);
  });
  it("inválido → null", () => {
    assert.equal(parsePrice(""), null);
    assert.equal(parsePrice(null), null);
    assert.equal(parsePrice("grátis"), null);
    assert.equal(parsePrice("0"), null);
    assert.equal(parsePrice("-5"), null);
  });
});
