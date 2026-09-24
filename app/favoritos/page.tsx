import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Meus favoritos",
  description: "Produtos e mercados que você favoritou.",
};

export default async function FavoritosPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Meus favoritos</h1>
        <EmptyState
          icon={Heart}
          title="Favoritos indisponíveis"
          description="Conecte o Supabase (.env.local, veja README)."
        />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/conta");

  const { data } = await supabase
    .from("favorites")
    .select("id, target_type, target_id, created_at")
    .order("created_at", { ascending: false });
  const favs = (data ?? []) as {
    id: string;
    target_type: string;
    target_id: string;
  }[];

  const productIds = favs.filter((f) => f.target_type === "product").map((f) => f.target_id);
  const marketIds = favs.filter((f) => f.target_type === "market").map((f) => f.target_id);

  const [{ data: products }, { data: markets }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name, slug, brand").in("id", productIds)
      : Promise.resolve({ data: [] as unknown[] }),
    marketIds.length > 0
      ? supabase.from("markets").select("id, name, slug").in("id", marketIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const productMap = new Map(
    ((products ?? []) as { id: string; name: string; slug: string; brand: string | null }[]).map(
      (p) => [p.id, p],
    ),
  );
  const marketMap = new Map(
    ((markets ?? []) as { id: string; name: string; slug: string }[]).map((m) => [
      m.id,
      m,
    ]),
  );

  if (favs.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Meus favoritos</h1>
        <EmptyState
          icon={Heart}
          title="Nenhum favorito ainda"
          description="Toque em “Favoritar” num produto ou mercado para vê-lo aqui."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Meus favoritos</h1>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {favs.map((f) => {
          if (f.target_type === "product") {
            const p = productMap.get(f.target_id);
            if (!p) return null;
            return (
              <li key={f.id}>
                <Link href={`/produtos/${p.slug}`}>
                  <Card className="transition-colors hover:bg-accent">
                    <CardContent className="pt-6">
                      <p className="font-semibold">{p.name}</p>
                      {p.brand && (
                        <p className="text-xs text-muted-foreground">{p.brand}</p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          }
          if (f.target_type === "market") {
            const m = marketMap.get(f.target_id);
            if (!m) return null;
            return (
              <li key={f.id}>
                <Link href={`/mercados/${m.slug}`}>
                  <Card className="transition-colors hover:bg-accent">
                    <CardContent className="pt-6">
                      <p className="font-semibold">{m.name}</p>
                      <p className="text-xs text-muted-foreground">Mercado</p>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          }
          return null;
        })}
      </ul>
    </div>
  );
}
