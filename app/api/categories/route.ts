import { NextResponse } from "next/server";
import { getCategories } from "@/lib/catalog/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Lista categorias ativas */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ results: [] });
  }
  const supabase = await createClient();
  const rows = await getCategories(supabase);
  return NextResponse.json({ results: rows });
}