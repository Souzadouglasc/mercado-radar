import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/catalog/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Autocomplete de produtos p/ adicionar itens na lista (id, name, brand, slug). */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (q.length < 2 || !isSupabaseConfigured()) {
    return NextResponse.json({ results: [] });
  }
  const supabase = await createClient();
  const rows = await searchProducts(supabase, q, 8);
  return NextResponse.json({
    results: rows.map((r) => ({
      id: r.id,
      name: r.name,
      brand: r.brand,
      slug: r.slug,
    })),
  });
}
