"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/conta");
  return { supabase, user };
}

export async function createList(_prev: string | null, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) return "Dê um nome para a lista.";
  const { supabase, user } = await requireUser();
  const { error, data } = await supabase
    .from("shopping_lists")
    .insert({ name, user_id: user.id })
    .select("id")
    .single();
  if (error) return "Não foi possível criar a lista. Tente de novo.";
  revalidatePath("/listas");
  redirect(`/listas/${(data as { id: string }).id}`);
}

export async function renameList(_prev: string | null, formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!id || !name) return "Nome inválido.";
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("shopping_lists")
    .update({ name })
    .eq("id", id);
  if (error) return "Não foi possível renomear. Tente de novo.";
  revalidatePath("/listas");
  revalidatePath(`/listas/${id}`);
  return null;
}

export async function deleteList(_prev: string | null, formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return "Lista inválida.";
  const { supabase } = await requireUser();
  const { error } = await supabase.from("shopping_lists").delete().eq("id", id);
  if (error) return "Não foi possível excluir. Tente de novo.";
  revalidatePath("/listas");
  redirect("/listas");
}

export async function addItem(_prev: string | null, formData: FormData) {
  const listId = String(formData.get("list_id") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  const qty = Number(String(formData.get("quantity") ?? "1").replace(",", "."));
  if (!listId || !productId) return "Escolha um produto.";
  if (!Number.isFinite(qty) || qty <= 0) return "Quantidade inválida.";
  const { supabase } = await requireUser();
  const { error } = await supabase.from("shopping_list_items").upsert(
    { list_id: listId, product_id: productId, quantity: qty },
    { onConflict: "list_id,product_id" },
  );
  if (error) return "Não foi possível adicionar. Tente de novo.";
  revalidatePath(`/listas/${listId}`);
  return null;
}

export async function setItemQuantity(_prev: string | null, formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const listId = String(formData.get("list_id") ?? "");
  const qty = Number(String(formData.get("quantity") ?? "1").replace(",", "."));
  if (!id || !Number.isFinite(qty) || qty <= 0) return "Quantidade inválida.";
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("shopping_list_items")
    .update({ quantity: qty })
    .eq("id", id);
  if (error) return "Não foi possível atualizar. Tente de novo.";
  revalidatePath(`/listas/${listId}`);
  return null;
}

export async function removeItem(_prev: string | null, formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const listId = String(formData.get("list_id") ?? "");
  if (!id) return "Item inválido.";
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("id", id);
  if (error) return "Não foi possível remover. Tente de novo.";
  revalidatePath(`/listas/${listId}`);
  return null;
}
