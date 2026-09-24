import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks, Search, TrendingDown, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { Price } from "@/components/price";
import { ProductCard } from "@/components/product-card";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  biggestDrops,
  latestPrices,
  nearHistoricLow,
  type DealRow,
} from "@/lib/catalog/queries";

export const metadata: Metadata = {
  title: "Compare preços de supermercados",
  description:
    "MercadoRadar compara preços nos mercados Fort, Koch, Brasil e Komprão para você economizar.",
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
    .select("id, name, slug, brand, unit, quantity")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(5);
  if (!products || products.length === 0) {
    return (
      <EmptyState
        title="Nenhum produto cadastrado"
        description="Cadastre produtos e lance preços manuais no /admin para ver a comparação aqui."
      />
    );
  }
  const cards = await Promise.all(
    (products as { id: string; name: string; slug: string; brand: string | null; unit: string | null; quantity: number | null }[]).map(
      async (p) => ({ product: p, latest: await latestPrices(supabase, p.id) }),
    ),
  );
  const comPreco = cards.filter((c) => c.latest.length > 0);
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
    <ul className="flex flex-col gap-2">
      {deals.map((d) => (
        <li key={d.id}>
          <Link
            href={`/produtos/${d.slug}`}
            className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors hover:bg-accent"
          >
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2 truncate text-sm font-medium">
                <span className="truncate">{d.name}</span>
                <Badge variant="default" className="shrink-0 text-[10px]">
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
  const supabase = await createClient();
  const [drops, lows] = await Promise.all([
    biggestDrops(supabase),
    nearHistoricLow(supabase),
  ]);
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
          <TrendingDown className="h-4 w-4 text-primary" /> Maiores quedas
        </h3>
        <DealList deals={drops} kind="drop" />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <Trophy className="h-4 w-4 text-primary" /> Perto do mínimo histórico
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

export default function HomePage() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col items-start gap-4 py-4">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Descubra onde sua compra sai <span className="text-primary">mais barata</span>
        </h1>
        <p className="text-muted-foreground">
          Compare preços de produtos nos principais mercados da região, monte listas de compras e
          receba alertas de queda de preço.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/buscar">
              <Search className="h-4 w-4" /> Buscar produtos
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/listas">
              <ListChecks className="h-4 w-4" /> Minhas listas
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-primary" /> Comparador
            </CardTitle>
            <CardDescription>Último preço por mercado, lado a lado.</CardDescription>
          </CardHeader>
          <CardContent>
            <Comparador />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-primary" /> Ofertas em destaque
            </CardTitle>
            <CardDescription>Maiores quedas e mínimos históricos.</CardDescription>
          </CardHeader>
          <CardContent>
            <Ofertas />
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">Mercados monitorados</h2>
        <Mercados />
      </section>
    </div>
  );
}
