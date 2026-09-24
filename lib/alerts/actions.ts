"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, user };
}

export async function createAlert(_prev: string | null, formData: FormData) {
  const ctx = await requireUser();
  if (!ctx) return "Entre na sua conta para criar alertas.";
  const productId = String(formData.get("product_id") ?? "");
  const marketRaw = String(formData.get("market_id") ?? "").trim();
  const marketId = !marketRaw || marketRaw === "__all" ? null : marketRaw;
  const targetRaw = String(formData.get("target_price") ?? "").trim().replace(",", ".");
  const dropRaw = String(formData.get("drop_percent") ?? "").trim().replace(",", ".");
  const notifyLowest = formData.get("notify_lowest") === "on";
  if (!productId) return "Produto inválido.";
  const target_price = targetRaw ? Number(targetRaw) : null;
  const drop_percent = dropRaw ? Number(dropRaw) : null;
  if (target_price !== null && (!Number.isFinite(target_price) || target_price <= 0))
    return "Preço-alvo inválido.";
  if (
    drop_percent !== null &&
    (!Number.isFinite(drop_percent) || drop_percent <= 0 || drop_percent > 100)
  )
    return "Queda % inválida (1–100).";
  if (target_price === null && drop_percent === null && !notifyLowest)
    return "Defina preço-alvo, queda % ou mínimo histórico.";
  const { error } = await ctx.supabase.from("price_alerts").insert({
    user_id: ctx.user.id,
    product_id: productId,
    market_id: marketId,
    target_price,
    drop_percent,
    notify_lowest: notifyLowest,
  });
  if (error) return "Não foi possível criar o alerta. Tente de novo.";
  revalidatePath("/alertas");
  return null;
}

export async function toggleAlert(_prev: string | null, formData: FormData) {
  const ctx = await requireUser();
  if (!ctx) return "Entre na sua conta.";
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "on";
  if (!id) return "Alerta inválido.";
  const { error } = await ctx.supabase
    .from("price_alerts")
    .update({ active: !active })
    .eq("id", id);
  if (error) return "Não foi possível atualizar. Tente de novo.";
  revalidatePath("/alertas");
  return null;
}

export async function deleteAlert(_prev: string | null, formData: FormData) {
  const ctx = await requireUser();
  if (!ctx) return "Entre na sua conta.";
  const id = String(formData.get("id") ?? "");
  if (!id) return "Alerta inválido.";
  const { error } = await ctx.supabase.from("price_alerts").delete().eq("id", id);
  if (error) return "Não foi possível excluir. Tente de novo.";
  revalidatePath("/alertas");
  return null;
}

export async function markNotificationRead(formData: FormData) {
  const ctx = await requireUser();
  if (!ctx) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await ctx.supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id);
  revalidatePath("/alertas");
}
