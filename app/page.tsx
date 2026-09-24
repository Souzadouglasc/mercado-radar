import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ListChecks, Search, ShoppingCart, TrendingDown, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Price } from "@/components/price";
import { ProductCard } from "@/components/product-card";
import { SearchAutocomplete } from "@/components/search-autocomplete";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getCachedDeals } from "@/lib/catalog/cached";
import { latestPricesBatch, type DealRow } from "@/lib/catalog/queries";

export const metadata: Metadata = {
  title: "Compare preços de supermercados",
  description:
    "MercadoRadar compara preços nos mercados Fort, Koch, Brasil e Komprão para você economizar.",
};

const PRODUCT_FIELDS = "id, name, slug, brand, unit, quantity, image_url";

type CardProduct = {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  unit: string | null;
  quantity: number | null;
  image_url: string | null;
};

async function Comparador() {
  if (!isSupabaseConfigured()) {
    return (
      <EmptyState
        title="Nenhum preço coletado ainda"
        description="Conecte o Supabase (.env.local, veja README). A coleta automática começa na Fase 4; preços manuais entram pelo /admin."
      />
    );
  }
  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(5);
  const rows = (products ?? []) as CardProduct[];
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nenhum produto cadastrado"
        description="Cadastre produtos e lance preços manuais no /admin para ver a comparação aqui."
      />
    );
  }
  // 1 round-trip (RPC latest_prices_for_products) — sem N+1.
  const batch = await latestPricesBatch(
    supabase,
    rows.map((p) => p.id),
  );
  const comPreco = rows
    .map((p) => ({ product: p, latest: batch.get(p.id) ?? [] }))
    .filter((c) => c.latest.length > 0);
  if (comPreco.length === 0) {
    return (
      <EmptyState
        title="Produtos sem preço ainda"
        description="Lance preços manuais no /admin para ver a comparação aqui."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {comPreco.slice(0, 3).map((c) => (
        <li key={c.product.id}>
          <ProductCard product={c.product} latest={c.latest} />
        </li>
      ))}
    </ul>
  );
}

/** Card "Onde comprar hoje": melhor mercado (menor média dos últimos preços). */
async function OndeComprarHoje() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: marketsData } = await supabase
    .from("markets")
    .select("id, name, slug")
    .eq("active", true)
    .order("name");
  const markets = (marketsData ?? []) as { id: string; name: string; slug: string }[];
  if (markets.length === 0) return null;
  const { data: recent } = await supabase
    .from("prices")
    .select("market_id, price, promotional_price")
    .order("collected_at", { ascending: false })
    .limit(200);
  const rows = (recent ?? []) as {
    market_id: string;
    price: number | string;
    promotional_price: number | string | null;
  }[];
  const sums = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    const e = sums.get(r.market_id) ?? { sum: 0, n: 0 };
    e.sum += Number(r.promotional_price ?? r.price);
    e.n += 1;
    sums.set(r.market_id, e);
  }
  const ranked = markets
    .filter((m) => (sums.get(m.id)?.n ?? 0) > 0)
    .map((m) => ({ ...m, avg: sums.get(m.id)!.sum / sums.get(m.id)!.n }))
    .sort((a, b) => a.avg - b.avg);
  if (ranked.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Sem dados para recomendar"
        description="Com mais coletas, indicamos aqui o mercado mais barato hoje."
      />
    );
  }
  const best = ranked[0];
  return (
    <Card className="border-2 border-primary">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingCart className="h-5 w-5 text-primary" aria-hidden /> Onde comprar hoje
        </CardTitle>
        <CardDescription>Menor média dos preços coletados recentemente.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-2">
        <span className="flex flex-col gap-1">
          <Link href={`/mercados/${best.slug}`} className="font-bold hover:underline">
            {best.name}
          </Link>
          <span className="text-xs text-muted-foreground">
            média de {ranked.length} {ranked.length === 1 ? "mercado" : "mercados"} monitorados
          </span>
        </span>
        <Button asChild size="sm">
          <Link href={`/mercados/${best.slug}`}>Ver ofertas</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function DealList({ deals, kind }: { deals: DealRow[]; kind: "drop" | "low" }) {
  if (deals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {kind === "drop"
          ? "Sem quedas acima de 5% nos últimos 30 dias."
          : "Nenhum produto perto do mínimo histórico."}
      </p>
    );
  }
  return (
    <ul className="snap-row flex gap-2 overflow-x-auto pb-1 sm:flex-col sm:overflow-visible">
      {deals.map((d) => (
        <li key={d.id} className="w-56 shrink-0 sm:w-auto">
          <Link
            href={`/produtos/${d.slug}`}
            className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors hover:bg-accent"
          >
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span className="truncate">{d.name}</span>
                <Badge
                  variant={kind === "drop" ? "default" : "secondary"}
                  className="shrink-0 text-[10px]"
                >
                  {kind === "drop" ? `-${d.dropPercent}%` : `+${d.dropPercent}% do mín.`}
                </Badge>
              </span>
              <span className="text-xs text-muted-foreground">{d.marketName}</span>
            </span>
            <Price value={d.current} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function Ofertas() {
  if (!isSupabaseConfigured()) return null;
  const { drops, lows } = await getCachedDeals();
  if (drops.length === 0 && lows.length === 0) {
    return (
      <EmptyState
        icon={TrendingDown}
        title="Sem ofertas em destaque"
        description="Com mais coletas de preço, mostramos aqui as maiores quedas e produtos perto do mínimo histórico."
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <TrendingDown className="h-4 w-4 text-primary" aria-hidden /> Maiores quedas
        </h3>
        <DealList deals={drops} kind="drop" />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <Trophy className="h-4 w-4 text-primary" aria-hidden /> Perto do mínimo histórico
        </h3>
        <DealList deals={lows} kind="low" />
      </div>
    </div>
  );
}

async function Mercados() {
  if (!isSupabaseConfigured()) {
    return (
      <ul className="grid gap-3 sm:grid-cols-2">
        {[
          { name: "Fort Atacadista", slug: "fort" },
          { name: "SuperKoch", slug: "koch" },
          { name: "Brasil Atacadista", slug: "brasil" },
          { name: "Komprão", slug: "komprao" },
        ].map((m) => (
          <li key={m.slug}>
            <Link
              href={`/mercados/${m.slug}`}
              className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 shadow-sm transition-colors hover:bg-accent"
            >
              <span className="font-medium">{m.name}</span>
              <Badge variant="outline">Em breve</Badge>
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("markets")
    .select("id, name, slug, website_url, city, active")
    .eq("active", true)
    .order("name");
  const markets = (data ?? []) as { name: string; slug: string }[];
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {markets.map((m) => (
        <li key={m.slug}>
          <Link
            href={`/mercados/${m.slug}`}
            className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 shadow-sm transition-colors hover:bg-accent"
          >
            <span className="font-medium">{m.name}</span>
            <Badge variant="outline">Ver preços</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SectionSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="shimmer h-16 w-full" />
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col gap-8">
      {/* Hero compacto: busca em destaque no topo */}
      <section className="flex flex-col gap-3 py-2">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Descubra onde sua compra sai <span className="text-primary">mais barata</span>
        </h1>
        <SearchAutocomplete />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild size="sm">
            <Link href="/buscar">
              <Search className="h-4 w-4" /> Busca avançada
            </Link>
          </Button>
          <Button variant="outline" asChild size="sm">
            <Link href="/listas">
              <ListChecks className="h-4 w-4" /> Minhas listas
            </Link>
          </Button>
        </div>
      </section>

      <Suspense fallback={<Skeleton className="shimmer h-32 w-full rounded-xl" />}>
        <OndeComprarHoje />
      </Suspense>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-primary" aria-hidden /> Comparador
            </CardTitle>
            <CardDescription>Último preço por mercado, lado a lado.</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<SectionSkeleton />}>
              <Comparador />
            </Suspense>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-primary" aria-hidden /> Ofertas em destaque
            </CardTitle>
            <CardDescription>Maiores quedas e mínimos históricos.</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<SectionSkeleton lines={2} />}>
              <Ofertas />
            </Suspense>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">Mercados monitorados</h2>
        <Suspense fallback={<SectionSkeleton lines={4} />}>
          <Mercados />
        </Suspense>
      </section>
    </div>
  );
}
