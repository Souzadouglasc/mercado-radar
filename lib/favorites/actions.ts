"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FavoriteTarget = "product" | "market" | "list";

async function userClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, user };
}

export async function toggleFavorite(targetType: FavoriteTarget, targetId: string) {
  const ctx = await userClient();
  if (!ctx) return { error: "Entre na sua conta para favoritar." };
  const { supabase, user } = ctx;
  const { data: existing } = await supabase
    .from("favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("id", (existing as { id: string }).id);
    if (error) return { error: "Não foi possível remover. Tente de novo." };
  } else {
    const { error } = await supabase.from("favorites").insert({
      user_id: user.id,
      target_type: targetType,
      target_id: targetId,
    });
    if (error) return { error: "Não foi possível favoritar. Tente de novo." };
  }
  revalidatePath("/favoritos");
  revalidatePath("/conta");
  return { error: null };
}

/** Ids favoritados pelo usuário logado (para marcar corações em listas de cards). */
export async function favoriteIds(
  targetType: FavoriteTarget,
  targetIds: string[],
): Promise<Set<string>> {
  const ctx = await userClient();
  if (!ctx || targetIds.length === 0) return new Set();
  const { data } = await ctx.supabase
    .from("favorites")
    .select("target_id")
    .eq("user_id", ctx.user.id)
    .eq("target_type", targetType)
    .in("target_id", targetIds);
  return new Set(((data ?? []) as { target_id: string }[]).map((r) => r.target_id));
}

export async function isFavorite(
  targetType: FavoriteTarget,
  targetId: string,
): Promise<boolean> {
  const ctx = await userClient();
  if (!ctx) return false;
  const { data } = await ctx.supabase
    .from("favorites")
    .select("id")
    .eq("user_id", ctx.user.id)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .maybeSingle();
  return Boolean(data);
}
