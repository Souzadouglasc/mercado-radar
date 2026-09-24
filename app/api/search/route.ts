import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/catalog/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Autocomplete de produtos (id, name, brand, slug, image_url, minPrice). */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (q.length < 2 || !isSupabaseConfigured()) {
    return NextResponse.json({ results: [] });
  }
  const supabase = await createClient();
  const rows = await searchProducts(supabase, q, 8);
  return NextResponse.json({
    results: rows.map((r) => {
      const prices = r.latest.map((l) => l.promotional_price ?? l.price);
      return {
        id: r.id,
        name: r.name,
        brand: r.brand,
        slug: r.slug,
        image_url: r.image_url,
        minPrice: prices.length > 0 ? Math.min(...prices) : null,
      };
    }),
  });
}
