"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./guard";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

async function formError(fn: () => Promise<void>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Erro inesperado.";
  }
}

export async function upsertMarket(_prev: string | null, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim() || slugify(name);
  if (!name || !slug) return "Nome é obrigatório.";
  return formError(async () => {
    const { admin } = await requireAdmin();
    const row = {
      name,
      slug,
      website_url: String(formData.get("website_url") ?? "").trim() || null,
      osuper_api_url: String(formData.get("osuper_api_url") ?? "").trim() || null,
      osuper_store_id: String(formData.get("osuper_store_id") ?? "").trim() || null,
      city: String(formData.get("city") ?? "").trim() || null,
      active: formData.get("active") === "on",
    };
    const id = String(formData.get("id") ?? "");
    const { error } = id
      ? await admin.from("markets").update(row).eq("id", id)
      : await admin.from("markets").insert(row);
    if (error) throw new Error(error.message);
    revalidatePath("/admin");
    revalidatePath("/");
  });
}

export async function upsertCategory(_prev: string | null, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim() || slugify(name);
  if (!name || !slug) return "Nome é obrigatório.";
  return formError(async () => {
    const { admin } = await requireAdmin();
    const row = { name, slug };
    const id = String(formData.get("id") ?? "");
    const { error } = id
      ? await admin.from("categories").update(row).eq("id", id)
      : await admin.from("categories").insert(row);
    if (error) throw new Error(error.message);
    revalidatePath("/admin");
  });
}

export async function upsertProduct(_prev: string | null, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim() || slugify(name);
  if (!name || !slug) return "Nome é obrigatório.";
  return formError(async () => {
    const { admin } = await requireAdmin();
    const qtyRaw = String(formData.get("quantity") ?? "").trim().replace(",", ".");
    const row = {
      name,
      slug,
      brand: String(formData.get("brand") ?? "").trim() || null,
      category_id: String(formData.get("category_id") ?? "").trim() || null,
      barcode: String(formData.get("barcode") ?? "").trim() || null,
      unit: String(formData.get("unit") ?? "").trim() || null,
      quantity: qtyRaw ? Number(qtyRaw) : null,
    };
    if (row.quantity !== null && !Number.isFinite(row.quantity))
      throw new Error("Quantidade inválida.");
    const id = String(formData.get("id") ?? "");
    let productId: string | null = id || null;
    if (id) {
      const { error } = await admin.from("products").update(row).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await admin
        .from("products")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      productId = (data as { id: string }).id;
    }
    const rawName = String(formData.get("alias_raw_name") ?? "").trim();
    const aliasMarketId = String(formData.get("alias_market_id") ?? "").trim();
    if (rawName && aliasMarketId && productId) {
      const { error } = await admin.from("product_aliases").upsert(
        { product_id: productId, market_id: aliasMarketId, raw_name: rawName },
        { onConflict: "product_id,market_id,raw_name" },
      );
      if (error) throw new Error(error.message);
    }
    revalidatePath("/admin");
    revalidatePath("/");
  });
}

export async function addManualPrice(_prev: string | null, formData: FormData) {
  const productId = String(formData.get("product_id") ?? "").trim();
  const marketId = String(formData.get("market_id") ?? "").trim();
  const price = Number(String(formData.get("price") ?? "").replace(",", "."));
  if (!productId || !marketId) return "Produto e mercado são obrigatórios.";
  if (!Number.isFinite(price) || price <= 0) return "Preço inválido.";
  return formError(async () => {
    const { admin } = await requireAdmin();
    const promoRaw = String(formData.get("promotional_price") ?? "").trim().replace(",", ".");
    const promotional = promoRaw ? Number(promoRaw) : null;
    if (promotional !== null && (!Number.isFinite(promotional) || promotional <= 0))
      throw new Error("Preço promocional inválido.");
    const { error } = await admin.from("prices").insert({
      product_id: productId,
      market_id: marketId,
      price,
      promotional_price: promotional,
      source_id: 3, // manual
      source_url: String(formData.get("source_url") ?? "").trim() || null,
      collected_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    revalidatePath("/admin");
    revalidatePath("/");
  });
}

export async function deleteRow(
  table: "markets" | "categories" | "products" | "product_aliases",
  id: string,
) {
  const { admin } = await requireAdmin();
  if (!id) throw new Error("ID ausente.");
  const { error } = await admin.from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}
