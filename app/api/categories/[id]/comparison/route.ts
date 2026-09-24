import { NextResponse } from "next/server";
import { searchProductsByCategory } from "@/lib/catalog/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Comparação de preços por categoria (com preço por unidade) */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);
  const city = url.searchParams.get("city") ?? undefined;
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ results: [] });
  }
  const supabase = await createClient();
  const rows = await searchProductsByCategory(supabase, id, limit, city);

  return NextResponse.json({
    results: rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      brand: r.brand,
      unit: r.unit,
      quantity: r.quantity,
      image_url: r.image_url,
      pricePerUnit: r.pricePerUnit,
      cheapestMarket: r.cheapestMarket,
      latest: r.latest.map((l) => ({
        market: l.market,
        price: l.price,
        promotional_price: l.promotional_price,
        collected_at: l.collected_at,
      })),
    })),
  });
}