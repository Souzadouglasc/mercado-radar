import type { Metadata } from "next";
import { Suspense } from "react";
import { Search } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ProductCard } from "@/components/product-card";
import { SearchBox } from "@/components/search-box";
import { Skeleton } from "@/components/ui/skeleton";
import { getCachedSearch } from "@/lib/catalog/cached";
import { searchProducts } from "@/lib/catalog/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Buscar produtos",
  description: "Busque produtos e compare preços entre mercados.",
};

async function Resultados({ q }: { q: string }) {
  if (!q.trim()) {
    return (
      <EmptyState
        icon={Search}
        title="Digite algo para buscar"
        description="Procure produtos por nome ou marca e compare o último preço por mercado."
      />
    );
  }
  if (!isSupabaseConfigured()) {
    return (
      <EmptyState
        icon={Search}
        title="Busca indisponível"
        description="Conecte o Supabase (.env.local, veja README) para buscar no catálogo."
      />
    );
  }
  // Busca anônima usa cache (300s); logada usa client com cookies (fresco).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const resultados = user
    ? await searchProducts(supabase, q)
    : await getCachedSearch(q.trim().slice(0, 80));
  if (resultados.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title={`Nada encontrado para “${q}”`}
        description="Tente outro termo. Novos produtos chegam via cadastro no /admin ou coleta automática."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {resultados.map((r) => (
        <li key={r.id}>
          <ProductCard product={r} latest={r.latest} />
        </li>
      ))}
    </ul>
  );
}

export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">
        {q ? `Resultados para “${q}”` : "Buscar produtos"}
      </h1>
      <Suspense fallback={<Skeleton className="shimmer h-10 w-full" />}>
        <SearchBox initial={q} />
      </Suspense>
      <Suspense
        fallback={
          <div className="flex flex-col gap-2" aria-hidden>
            <Skeleton className="shimmer h-24 w-full" />
            <Skeleton className="shimmer h-24 w-full" />
            <Skeleton className="shimmer h-24 w-full" />
          </div>
        }
      >
        <Resultados q={q} />
      </Suspense>
    </div>
  );
}
