import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { FavoriteButton } from "@/components/favorite-button";
import { ProductCard } from "@/components/product-card";
import { latestPrices } from "@/lib/catalog/queries";
import { isFavorite } from "@/lib/favorites/actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ slug: string }> };

const NOMES: Record<string, string> = {
  fort: "Fort Atacadista",
  koch: "SuperKoch",
  brasil: "Brasil Atacadista",
  komprao: "Komprão",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const name = NOMES[slug] ?? slug;
  return {
    title: `Mercado: ${name}`,
    description: `Ofertas e preços monitorados em ${name}.`,
  };
}

export default async function MercadoPage({ params }: Props) {
  const { slug } = await params;
  const fallbackName = NOMES[slug] ?? slug;

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">{fallbackName}</h1>
        <EmptyState
          icon={Store}
          title="Catálogo indisponível"
          description="Conecte o Supabase (.env.local, veja README) para ver preços reais."
        />
      </div>
    );
  }

  const supabase = await createClient();
  const { data: market } = await supabase
    .from("markets")
    .select("id, name, slug, website_url, city, active")
    .eq("slug", slug)
    .single();
  if (!market) notFound();
  const m = market as { id: string; name: string; city: string | null };
  const fav = await isFavorite("market", m.id);

  const { data: recent } = await supabase
    .from("prices")
    .select("product_id, collected_at")
    .eq("market_id", m.id)
    .order("collected_at", { ascending: false })
    .limit(60);
  const productIds = [...new Set(((recent ?? []) as { product_id: string }[]).map((r) => r.product_id))].slice(0, 12);

  if (productIds.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Badge variant="secondary" className="w-fit">
              Sem coleta ainda
            </Badge>
            <h1 className="text-2xl font-bold">{m.name}</h1>
            {m.city && <p className="text-sm text-muted-foreground">{m.city}</p>}
          </div>
          <FavoriteButton targetType="market" targetId={m.id} initial={fav} />
        </div>
        <EmptyState
          icon={Store}
          title="Nenhuma oferta monitorada ainda"
          description="Lance preços manuais no /admin ou aguarde a coleta automática (Fase 4)."
        />
      </div>
    );
  }

  const { data: products } = await supabase
    .from("products")
    .select("id, name, slug, brand, unit, quantity")
    .in("id", productIds);
  const cards = await Promise.all(
    ((products ?? []) as { id: string; name: string; slug: string; brand: string | null; unit: string | null; quantity: number | null }[]).map(
      async (p) => ({ product: p, latest: await latestPrices(supabase, p.id) }),
    ),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">{m.name}</h1>
          {m.city && <p className="text-sm text-muted-foreground">{m.city}</p>}
        </div>
        <FavoriteButton targetType="market" targetId={m.id} initial={fav} />
      </div>
      <ul className="flex flex-col gap-3">
        {cards.map((c) => (
          <li key={c.product.id}>
            <ProductCard product={c.product} latest={c.latest} />
            <Link
              href={`/produtos/${c.product.slug}`}
              className="mt-1 inline-block text-xs text-muted-foreground hover:underline"
            >
              Ver histórico
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
