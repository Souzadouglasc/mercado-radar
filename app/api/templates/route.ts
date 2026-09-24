import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/** Cria template personalizado do usuário */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 503 });
  }
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { name, description, icon, items } = body as {
    name: string;
    description?: string;
    icon?: string;
    items: {
      product_name: string;
      brand?: string | null;
      quantity: number;
      unit?: string | null;
      category_hint?: string | null;
    }[];
  };

  if (!name?.trim() || !items?.length) {
    return NextResponse.json({ error: "Nome e itens são obrigatórios" }, { status: 400 });
  }

  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

  // Cria o template
  const { data: template, error: tplError } = await supabase
    .from("list_templates")
    .insert({
      name: name.trim().slice(0, 80),
      slug,
      description: description?.trim().slice(0, 200) ?? null,
      icon: icon?.trim().slice(0, 2) ?? null,
      is_default: false,
      sort_order: 999,
    })
    .select("id")
    .single();

  if (tplError || !template) {
    return NextResponse.json({ error: "Erro ao criar template" }, { status: 500 });
  }

  const templateId = template.id;

  // Cria os itens do template
  const itemsToInsert = items.map((item, idx) => ({
    template_id: templateId,
    product_name: item.product_name.trim().slice(0, 120),
    brand: item.brand?.trim().slice(0, 60) ?? null,
    quantity: Number(item.quantity) || 1,
    unit: item.unit?.trim().slice(0, 20) ?? null,
    category_hint: item.category_hint?.trim().slice(0, 60) ?? null,
    sort_order: idx,
  }));

  const { error: itemsError } = await supabase
    .from("list_template_items")
    .insert(itemsToInsert);

  if (itemsError) {
    // Rollback template
    await supabase.from("list_templates").delete().eq("id", templateId);
    return NextResponse.json({ error: "Erro ao criar itens do template" }, { status: 500 });
  }

  return NextResponse.json({ id: templateId, slug });
}