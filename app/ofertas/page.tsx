import type { Metadata } from "next";
import Link from "next/link";
import { Tag, TrendingDown, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Price } from "@/components/price";
import { ProductImage } from "@/components/product-image";
import { getCachedDeals } from "@/lib/catalog/cached";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { DealRow } from "@/lib/catalog/queries";

export const metadata: Metadata = {
  title: "Ofertas do dia",
  description: "Compare quedas de preço e ofertas recentes em São José, Santa Catarina.",
};

function DealGrid({ deals, kind }: { deals: DealRow[]; kind: "drop" | "low" }) {
  if (deals.length === 0) {
    return <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">Ainda não há ofertas nesta seleção. Volte depois de uma nova coleta de preços.</p>;
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {deals.map((deal) => (
        <li key={`${deal.id}-${deal.marketSlug}`}>
          <Link href={`/produtos/${deal.slug}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
            <ProductImage image_url={deal.image_url} product={{ name: deal.name, brand: deal.brand }} aspect="landscape" className="w-full" alt={deal.name} />
            <div className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="line-clamp-2 font-semibold leading-snug group-hover:text-primary">{deal.name}</span>
                <Badge variant={kind === "drop" ? "default" : "secondary"} className="shrink-0">
                  {kind === "drop" ? `-${deal.dropPercent}%` : `${deal.dropPercent}% do mínimo`}
                </Badge>
              </div>
              <span className="mt-auto text-xs text-muted-foreground">{deal.marketName}</span>
              <Price value={deal.current} size="lg" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function OfertasPage() {
  if (!isSupabaseConfigured()) {
    return <EmptyState icon={Tag} title="Ofertas indisponíveis" description="Conecte o Supabase para carregar as ofertas monitoradas." />;
  }

  const { drops, lows } = await getCachedDeals();
  const hasDeals = drops.length > 0 || lows.length > 0;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-10">
      <header className="rounded-[2rem] bg-[#123c2b] px-6 py-9 text-white sm:px-10 sm:py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">MercadoRadar · São José</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">Ofertas para sua próxima compra</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/80 sm:text-base">Encontre quedas recentes e produtos com preço próximo do menor valor registrado.</p>
        <Button asChild variant="secondary" className="mt-6 rounded-full"><Link href="/buscar">Buscar um produto</Link></Button>
      </header>

      {hasDeals ? <>
        <section className="space-y-5">
          <div>
            <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-primary"><TrendingDown className="h-4 w-4" /> Preços em queda</p>
            <h2 className="text-2xl font-bold tracking-tight">Maiores quedas recentes</h2>
            <p className="mt-1 text-sm text-muted-foreground">Produtos que ficaram mais baratos em relação ao histórico recente.</p>
          </div>
          <DealGrid deals={drops} kind="drop" />
        </section>
        <section className="space-y-5">
          <div>
            <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-primary"><Trophy className="h-4 w-4" /> Bons preços</p>
            <h2 className="text-2xl font-bold tracking-tight">Perto do mínimo histórico</h2>
            <p className="mt-1 text-sm text-muted-foreground">Produtos próximos do menor preço observado nas coletas disponíveis.</p>
          </div>
          <DealGrid deals={lows} kind="low" />
        </section>
      </> : <EmptyState icon={Tag} title="Nenhuma oferta encontrada" description="As ofertas aparecem aqui quando novas coletas registram quedas de preço." />}
    </div>
  );
}
