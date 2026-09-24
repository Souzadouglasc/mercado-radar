"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { searchProducts } from "@/lib/catalog/queries";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/conta");
  return { supabase, user };
}

export type TemplateItemInput = {
  product_name: string;
  brand: string | null;
  quantity: number;
  unit: string | null;
  category_hint: string | null;
};

export type TemplateWithItems = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  is_default: boolean;
  sort_order: number;
  items: TemplateItemInput[];
};

export async function getTemplates(): Promise<TemplateWithItems[]> {
  const supabase = await createClient();
  const { data: templates } = await supabase
    .from("list_templates")
    .select("id, name, slug, description, icon, is_default, sort_order")
    .order("sort_order");
  if (!templates) return [];

  const templateIds = templates.map((t) => t.id);
  const { data: items } = await supabase
    .from("list_template_items")
    .select("template_id, product_name, brand, quantity, unit, category_hint, sort_order")
    .in("template_id", templateIds)
    .order("sort_order");

  const itemsByTemplate = new Map<string, TemplateItemInput[]>();
  for (const item of (items ?? []) as {
    template_id: string;
    product_name: string;
    brand: string | null;
    quantity: number;
    unit: string | null;
    category_hint: string | null;
    sort_order: number;
  }[]) {
    const list = itemsByTemplate.get(item.template_id) ?? [];
    list.push({
      product_name: item.product_name,
      brand: item.brand,
      quantity: Number(item.quantity),
      unit: item.unit,
      category_hint: item.category_hint,
    });
    itemsByTemplate.set(item.template_id, list);
  }

  return templates.map((t) => ({
    ...t,
    items: itemsByTemplate.get(t.id) ?? [],
  }));
}

/**
 * Cria uma lista de compras a partir de um template.
 * Para cada item do template, tenta achar produto via search_products_ft(product_name).
 * Se achar (>0 resultados): vincula o primeiro (melhor match) via product_id.
 * Se não achar: cria item avulsos com custom_name = product_name (+ brand se houver).
 */
export async function createListFromTemplate(
  _prev: string | null,
  formData: FormData
) {
  const ctx = await requireUser();
  const templateId = String(formData.get("template_id") ?? "");
  const listName = String(formData.get("list_name") ?? "").trim().slice(0, 80);

  if (!templateId) return "Template inválido.";
  if (!listName) return "Dê um nome para a lista.";

  // Busca template + itens
  const { data: template } = await ctx.supabase
    .from("list_templates")
    .select("id, name, slug")
    .eq("id", templateId)
    .single();
  if (!template) return "Template não encontrado.";

  const { data: templateItems } = await ctx.supabase
    .from("list_template_items")
    .select("product_name, brand, quantity, unit, category_hint")
    .eq("template_id", templateId)
    .order("sort_order");
  const items = (templateItems ?? []) as {
    product_name: string;
    brand: string | null;
    quantity: number;
    unit: string | null;
    category_hint: string | null;
  }[];

  if (items.length === 0) return "Template sem itens.";

  // Cria a lista
  const { data: list, error: listError } = await ctx.supabase
    .from("shopping_lists")
    .insert({ name: listName, user_id: ctx.user.id })
    .select("id")
    .single();
  if (listError || !list) return "Não foi possível criar a lista. Tente de novo.";
  const listId = (list as { id: string }).id;

  // Para cada item do template, busca produto e cria item da lista
  const listItems: {
    list_id: string;
    product_id: string | null;
    custom_name: string | null;
    quantity: number;
  }[] = [];

  for (const item of items) {
    const searchTerm = [item.brand, item.product_name].filter(Boolean).join(" ");
    const results = await searchProducts(ctx.supabase, searchTerm, 1);

    if (results.length > 0) {
      // Achou produto → vincula via product_id
      listItems.push({
        list_id: listId,
        product_id: results[0].id,
        custom_name: null,
        quantity: Number(item.quantity),
      });
    } else {
      // Não achou → item avulso com custom_name
      const customName = [item.brand, item.product_name].filter(Boolean).join(" ");
      listItems.push({
        list_id: listId,
        product_id: null,
        custom_name: customName,
        quantity: Number(item.quantity),
      });
    }
  }

  // Insere todos os itens em batch
  const { error: itemsError } = await ctx.supabase
    .from("shopping_list_items")
    .insert(listItems);
  if (itemsError) {
    // Tenta limpar a lista criada
    await ctx.supabase.from("shopping_lists").delete().eq("id", listId);
    return "Não foi possível adicionar os itens. Tente de novo.";
  }

  revalidatePath("/listas");
  redirect(`/listas/${listId}`);
}

export async function getCities(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("markets")
    .select("city")
    .not("city", "is", null)
    .eq("active", true);
  const cities = new Set<string>();
  for (const row of (data ?? []) as { city: string }[]) {
    if (row.city) cities.add(row.city);
  }
  return Array.from(cities).sort();
}