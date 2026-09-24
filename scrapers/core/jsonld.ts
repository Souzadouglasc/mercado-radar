/**
 * JSON-LD Extractor - MercadoRadar
 * Extrai schema.org/Product do HTML e converte para formato interno.
 * Reutilizado pelo OsuperProvider.
 */

import { normalizeName, parsePrice } from "./normalize.js";

export interface JsonLdProduct {
  name: string;
  sku?: string;
  brand?: string;
  image?: string; // normalized to single string in normalizeJsonLd
  offers?: { price?: string | number; availability?: string };
}

/** Extrai blocos JSON-LD de um HTML e retorna o de @type Product (se houver). */
export function extractJsonLdProduct(html: string): JsonLdProduct | null {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  for (const m of html.matchAll(re)) {
    try {
      const data = JSON.parse(m[1]);
      const blocks = Array.isArray(data) ? data : [data];
      for (const b of blocks) {
        const types = Array.isArray(b?.["@type"]) ? b["@type"] : [b?.["@type"]];
        if (b && types.includes("Product")) return normalizeJsonLd(b);
      }
    } catch {
      // bloco inválido — tenta o próximo
    }
  }
  return null;
}

function normalizeJsonLd(b: Record<string, unknown>): JsonLdProduct {
  const offers = (b.offers as Record<string, unknown> | undefined) ?? {};
  const brand = b.brand;
  return {
    name: String(b.name ?? ""),
    sku: b.sku != null ? String(b.sku) : undefined,
    brand:
      typeof brand === "object" && brand !== null
        ? String((brand as Record<string, unknown>).name ?? "")
        : brand != null
          ? String(brand)
          : undefined,
    image: Array.isArray(b.image)
      ? (b.image as string[])[0]
      : typeof b.image === "string"
        ? b.image
        : undefined,
    offers: {
      price: offers.price as string | number | undefined,
      availability: offers.availability as string | undefined,
    },
  };
}

export interface ToProductPriceInput {
  jsonld: JsonLdProduct;
  marketSlug: string;
  sourceUrl: string;
  collectedAt: string;
}

export interface ProductPrice {
  product_name: string;
  brand: string | null;
  barcode: string | null;
  unit: string | null;
  quantity: number | null;
  price: number;
  promotional_price: number | null;
  market_slug: string;
  source_url: string | null;
  source: "site-jsonld" | "graphql" | "manual" | "encarte";
  collected_at: string;
  image_url: string | null;
}

/** Converte JSON-LD em ProductPrice (contrato lib/ingest/schema.ts). null se sem preço válido. */
export function toProductPrice(input: ToProductPriceInput): ProductPrice | null {
  const { jsonld, marketSlug, sourceUrl, collectedAt } = input;
  if (!jsonld.name?.trim()) return null;
  const price = parsePrice(
    jsonld.offers?.price != null ? String(jsonld.offers.price) : null,
  );
  if (price == null) return null;
  const parsed = normalizeName(jsonld.name);
  const imageUrl = jsonld.image?.trim() || null;
  return {
    product_name: jsonld.name.trim().slice(0, 300),
    brand: jsonld.brand?.trim()?.slice(0, 120) || null,
    barcode: jsonld.sku?.trim()?.slice(0, 40) || null,
    unit: parsed.unit,
    quantity: parsed.quantity,
    price,
    promotional_price: null,
    market_slug: marketSlug,
    source_url: sourceUrl,
    source: "site-jsonld",
    collected_at: collectedAt,
    image_url: imageUrl,
  };
}