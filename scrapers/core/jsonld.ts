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
  offers?: { price?: string | number; lowPrice?: string | number; availability?: string };
}

/** Extrai produtos de JSON-LD, inclusive @graph e offers em lista. */
export function extractJsonLdProducts(html: string): JsonLdProduct[] {
  const products: JsonLdProduct[] = [];
  const seen = new Set<string>();
  const re = /<script\b(?=[^>]*\btype\s*=\s*["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (const m of html.matchAll(re)) {
    try {
      const data = JSON.parse(m[1]);
      const pending = Array.isArray(data) ? [...data] : [data];
      while (pending.length) {
        const block = pending.shift();
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        const types = Array.isArray(b["@type"]) ? b["@type"] : [b["@type"]];
        if (types.some((type) => typeof type === "string" && type.split("/").pop()?.split(":").pop()?.toLowerCase() === "product")) {
          const product = normalizeJsonLd(b);
          const key = `${product.sku ?? ""}|${product.name}|${String(product.offers?.price ?? product.offers?.lowPrice ?? "")}`;
          if (product.name.trim() && !seen.has(key)) {
            seen.add(key);
            products.push(product);
          }
        }
        for (const key of ["@graph", "mainEntity", "itemListElement"]) {
          const child = b[key];
          if (Array.isArray(child)) pending.push(...child);
          else if (child && typeof child === "object") pending.push(child);
        }
      }
    } catch {
      // bloco inválido — tenta o próximo
    }
  }
  return products;
}

/** Mantém compatibilidade para consumidores que esperam somente um produto. */
export function extractJsonLdProduct(html: string): JsonLdProduct | null {
  return extractJsonLdProducts(html)[0] ?? null;
}

function normalizeJsonLd(b: Record<string, unknown>): JsonLdProduct {
  const rawOffers = Array.isArray(b.offers) ? b.offers : [b.offers];
  const offer = rawOffers
    .filter((candidate): candidate is Record<string, unknown> => !!candidate && typeof candidate === "object")
    .find((candidate) => candidate.price != null || candidate.lowPrice != null) ?? {};
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
      price: offer.price as string | number | undefined,
      lowPrice: offer.lowPrice as string | number | undefined,
      availability: offer.availability as string | undefined,
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
  const price = parsePrice(String(jsonld.offers?.price ?? jsonld.offers?.lowPrice ?? ""));
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

