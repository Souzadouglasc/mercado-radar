import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/** GET template por ID com seus itens */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 503 });
  }
  const supabase = await createClient();
  const { id } = await params;

  const { data: template } = await supabase
    .from("list_templates")
    .select("id, name, slug, description, icon, is_default, sort_order")
    .eq("id", id)
    .single();

  if (!template) {
    return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });
  }

  const { data: items } = await supabase
    .from("list_template_items")
    .select("product_name, brand, quantity, unit, category_hint, sort_order")
    .eq("template_id", id)
    .order("sort_order");

  return NextResponse.json({
    ...template,
    items: items ?? [],
  });
}

/** DELETE template (apenas templates não-padrão do próprio usuário - via RLS) */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 503 });
  }
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;

  // RLS garante que só o dono (ou admin) possa deletar templates não-default
  const { error } = await supabase.from("list_templates").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}