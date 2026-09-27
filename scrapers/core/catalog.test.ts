import assert from "node:assert/strict";
import test from "node:test";
import { sameCanonicalPack } from "./catalog.js";

test("canonical product matching keeps different package sizes separate", () => {
  const oneLiter = {
    quantity: 1000,
    unit: "ml",
    normalized_quantity: 1,
    normalized_unit: "L" as const,
  };
  const twoLiters = {
    quantity: 2,
    unit: "l",
    normalized_quantity: 2,
    normalized_unit: "L" as const,
  };

  assert.equal(sameCanonicalPack(oneLiter, {
    quantity: 1,
    unit: "L",
    normalizedQuantity: 1,
    normalizedUnit: "L",
  }), true);
  assert.equal(sameCanonicalPack(oneLiter, {
    quantity: 2,
    unit: "L",
    normalizedQuantity: 2,
    normalizedUnit: "L",
  }), false);
  assert.equal(sameCanonicalPack(twoLiters, {
    quantity: null,
    unit: null,
    normalizedQuantity: null,
    normalizedUnit: null,
  }), false);
  assert.equal(sameCanonicalPack({
    quantity: null,
    unit: null,
    normalized_quantity: null,
    normalized_unit: null,
  }, {
    quantity: null,
    unit: null,
    normalizedQuantity: null,
    normalizedUnit: null,
  }), true);
});

