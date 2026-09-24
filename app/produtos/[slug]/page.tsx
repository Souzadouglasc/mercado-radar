import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PackageSearch, Plus, Trophy, Tag, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { FavoriteButton } from "@/components/favorite-button";
import { Price } from "@/components/price";
import { PriceChart } from "@/components/price-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateAlertForm } from "@/components/alert-forms";
import { AddToListForm } from "@/components/add-to-list-form";
import { ProductImage } from "@/components/product-image";
import {
  HISTORY_RANGE_DAYS,
  latestPrices,
  priceHistory,
  productStats,
  searchProducts,
  type HistoryRange,
  type ProductRow,
} from "@/lib/catalog/queries";
import { pricePerUnitFromProduct } from "@/lib/catalog/unit-price";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isFavorite } from "@/lib/favorites/actions";
import { formatPriceBRL } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string }>;
};

export const revalidate = 300;

const RANGES: { value: HistoryRange; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "6m", label: "180d" },
  { value: "1y", label: "365d" },
];

function validRange(raw: string | undefined): HistoryRange {
  return RANGES.some((r) => r.value === raw) ? (raw as HistoryRange) : "30d";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const name = slug.replace(/-/g, " ");
  return {
    title: `Produto: ${name}`,
    description: `Compare preços de ${name} nos mercados Fort, Koch, Brasil e Komprão.`,
    openGraph: {
      title: `MercadoRadar — ${name}`,
      description: `Compare preços de ${name} nos mercados da região e economize.`,
      type: "website",
      locale: "pt_BR",
    },
  };
}

function Estatisticas({
  stats,
}: {
  stats: NonNullable<Awaited<ReturnType<typeof productStats>>>;
}) {
  const variacao = stats.variation;
  const subiu = variacao !== null && variacao > 0;
  const caiu = variacao !== null && variacao < 0;
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div className="rounded-lg border p-3">
        <dt className="text-muted-foreground">Preço atual</dt>
        <dd className="font-bold">
          <Price value={stats.current} size="lg" />
        </dd>
      </div>
      <div className="rounded-lg border p-3">
        <dt className="text-muted-foreground">Preço médio</dt>
        <dd className="price-line text-base">{formatPriceBRL(stats.average)}</dd>
      </div>
      <div className="rounded-lg border p-3">
        <dt className="text-muted-foreground">Mínimo histórico</dt>
        <dd className="price-line text-base text-primary">{formatPriceBRL(stats.min)}</dd>
      </div>
      <div className="rounded-lg border p-3">
        <dt className="text-muted-foreground">Variação</dt>
        <dd
          className={
            caiu
              ? "font-semibold text-primary"
              : subiu
                ? "font-semibold text-rise"
                : "font-semibold"
          }
        >
          {variacao === null
            ? "—"
            : `${variacao > 0 ? "+" : ""}${variacao.toFixed(1)}%`}
        </dd>
      </div>
      <p className="col-span-2 text-xs text-muted-foreground">
        {stats.count} coletas · última atualização em{" "}
        {new Date(stats.lastUpdate).toLocaleString("pt-BR")}
      </p>
    </dl>
  );
}

function jsonLd(product: {
  name: string;
  brand: string | null;
  slug: string;
  image_url: string | null;
  unit: string | null;
  offers: { price: number; market: string; url: string; date: string }[];
}): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mercado-radar.vercel.app";
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    image: product.image_url ?? undefined,
    category: "Groceries",
    offers: product.offers.map((o) => ({
      "@type": "Offer",
      price: o.price,
      priceCurrency: "BRL",
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: o.market },
      url: `${site}${o.url}`,
      priceValidUntil: o.date,
    })),
  }).replace(/</g, "\\u003c");
}

// Produtos similares (mesma categoria, ordenados por R$/kg)
async function ProdutosSimilares({ product, excludeId }: { product: ProductRow; excludeId: string }) {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  // Busca produtos com nome similar (heurística simples: primeiras palavras do nome)
  const nameWords = product.name.toLowerCase().split(/\s+/).slice(0, 3).join(" ");
  const { data } = await supabase
    .from("products")
    .select("id, name, slug, brand, unit, quantity, image_url")
    .eq("active", true)
    .neq("id", excludeId)
    .ilike("name", `%${nameWords}%`)
    .limit(20);

  const rows = (data ?? []) as ProductRow[];
  if (rows.length === 0) return null;

  // Busca preços para calcular R$/un
  const { latestPricesBatch } = await import("@/lib/catalog/queries");
  const batch = await latestPricesBatch(supabase, rows.map((p) => p.id));

  const withUnitPrice = rows
    .map((p) => {
      const latest = batch.get(p.id) ?? [];
      const cheapest = latest.reduce((a, b) => {
        const ap = a.promotional_price ?? a.price;
        const bp = b.promotional_price ?? b.price;
        return ap <= bp ? a : b;
      }, latest[0]);
      const up = cheapest ? pricePerUnitFromProduct(cheapest.promotional_price ?? cheapest.price, p) : null;
      return { product: p, latest, unitPrice: up };
    })
    .filter((x) => x.unitPrice !== null)
    .sort((a, b) => (a.unitPrice!.pricePerUnit ?? Infinity) - (b.unitPrice!.pricePerUnit ?? Infinity))
    .slice(0, 6);

  if (withUnitPrice.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" aria-hidden /> Produtos similares
          </span>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/buscar?q=${encodeURIComponent(nameWords)}`}>
              Ver todos <ChevronRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </CardTitle>
        <p className="text-xs text-muted-foreground">Ordenados por preço por unidade (R$/kg, R$/L, R$/un)</p>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {withUnitPrice.map(({ product: p, latest, unitPrice }) => (
            <li key={p.id}>
              <Link
                href={`/produtos/${p.slug}`}
                className="flex flex-col gap-2 rounded-xl border bg-card overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-[2px]"
              >
                <ProductImage
                  image_url={p.image_url}
                  product={{ name: p.name, brand: p.brand }}
                  aspect="landscape"
                  className="w-full"
                  alt={p.name}
                />
                <div className="p-3 flex flex-col gap-1">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{p.name}</span>
                  </span>
                  {p.brand && <span className="text-xs text-muted-foreground">{p.brand}</span>}
                  <div className="flex items-baseline gap-2 pt-1">
                    {unitPrice && (
                      <span className="text-sm font-semibold text-primary">
                        {unitPrice.label}
                      </span>
                    )}
                    {latest.length > 0 && (
                      <Price value={latest[0].promotional_price ?? latest[0].price} />
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
      </Card>
  );
}

export default async function ProdutoPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { range: rawRange } = await searchParams;
  const range = validRange(rawRange);

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Produto</h1>
        <EmptyState
          icon={PackageSearch}
          title="Catálogo indisponível"
          description="Conecte o Supabase (.env.local, veja README) para ver preços reais."
        />
      </div>
    );
  }

  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("id, name, slug, brand, unit, quantity, image_url")
    .eq("slug", slug)
    .eq("active", true)
    .single();
  if (!product) notFound();
  const p = product as {
    id: string;
    name: string;
    slug: string;
    brand: string | null;
    unit: string | null;
    quantity: number | null;
    image_url: string | null;
  };

  const [latest, stats, history, fav] = await Promise.all([
    latestPrices(supabase, p.id),
    productStats(supabase, p.id),
    priceHistory(supabase, p.id, range),
    isFavorite("product", p.id),
  ]);
  const { data: marketsData } = await supabase
    .from("markets")
    .select("id, name")
    .eq("active", true)
    .order("name");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let userLists: { id: string; name: string }[] = [];
  if (user) {
    const { data } = await supabase
      .from("shopping_lists")
      .select("id, name")
      .order("updated_at", { ascending: false })
      .limit(10);
    userLists = (data ?? []) as { id: string; name: string }[];
  }
  const effective = (x: (typeof latest)[number]) => x.promotional_price ?? x.price;
  const sorted = [...latest].sort((a, b) => effective(a) - effective(b));
  const cheapest = sorted[0] ?? null;
  const days = HISTORY_RANGE_DAYS[range];

  return (
    <div className="flex flex-col gap-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            name: p.name,
            brand: p.brand,
            slug: p.slug,
            image_url: p.image_url,
            unit: p.unit,
            offers: sorted.map((x) => ({
              price: effective(x),
              market: x.market.name,
              url: `/produtos/${p.slug}`,
              date: x.collected_at,
            })),
          }),
        }}
      />

      {/* Hero: imagem grande + título + badge mercado + preço + R$/kg */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-2/5 flex-shrink-0">
          <ProductImage
            image_url={p.image_url}
            product={{ name: p.name, brand: p.brand }}
            aspect="video"
            priority
            className="rounded-2xl w-full"
            alt={p.name}
          />
        </div>
        <div className="lg:w-3/5 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{p.name}</h1>
            <p className="text-sm text-muted-foreground">
              {[p.brand, p.unit].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FavoriteButton targetType="product" targetId={p.id} initial={fav} label={`Favoritar ${p.name}`} />
          </div>

          {sorted.length > 0 && cheapest && (
            <div className="flex flex-col gap-2 p-4 rounded-xl bg-primary/5 border border-primary/20">
              <p className="flex items-center gap-2 text-sm font-medium text-primary">
                <Trophy className="h-4 w-4" aria-hidden />
                Menor preço: <span className="font-bold">{cheapest.market.name}</span>
              </p>
              <div className="flex items-baseline gap-3">
                <Price value={effective(cheapest)} size="lg" className="text-primary" />
                {(() => {
                  const up = pricePerUnitFromProduct(effective(cheapest), p);
                  return up ? (
                    <span className="text-sm font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
                      {up.label}
                    </span>
                  ) : null;
                })()}
              </div>
              <p className="text-xs text-muted-foreground">
                Atualizado em {new Date(cheapest.collected_at).toLocaleString("pt-BR")}
              </p>
            </div>
          )}

          {sorted.length === 0 && (
            <div className="p-4 rounded-xl bg-muted/50 border">
              <p className="text-sm text-muted-foreground">
                Preços ainda não coletados. Lance um preço manual no{' '}
                <Link href="/admin" className="underline">/admin</Link>
                {' '}ou aguarde a coleta automática.
              </p>
            </div>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="Preços ainda não coletados"
          description="Lance um preço manual no /admin ou aguarde a coleta automática (Fase 4)."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="flex flex-col gap-6">
            {/* Preços lado a lado com vencedor destacado */}
            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Preços por mercado</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-2 sm:px-6 sm:pb-6">
                <ul className="grid gap-2 sm:grid-cols-2">
                  {sorted.map((x) => {
                    const winner = cheapest?.market_id === x.market_id;
                    const up = pricePerUnitFromProduct(effective(x), p);
                    return (
                      <li
                        key={x.market_id}
                        className={cn(
                          "flex flex-col gap-1 rounded-xl p-3 transition-colors",
                          winner
                            ? "border-2 border-primary bg-primary/5"
                            : "border hover:bg-accent"
                        )}
                      >
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {x.market.name}
                          {winner && (
                            <Badge className="gap-1 text-[10px]">
                              <Trophy className="h-3 w-3" aria-hidden /> Menor preço
                            </Badge>
                          )}
                        </span>
                        <span className="flex items-baseline gap-2">
                          {x.promotional_price !== null && (
                            <s className="text-xs text-muted-foreground">
                              {formatPriceBRL(x.price)}
                            </s>
                          )}
                          <Price value={effective(x)} size={winner ? "lg" : "md"} className={winner ? "text-primary" : undefined} />
                          {up && (
                            <span className="text-sm text-muted-foreground font-normal bg-muted px-2 py-0.5 rounded">
                              {up.label}
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(x.collected_at).toLocaleString("pt-BR")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>

            {/* CTAs */}
            <div className="flex flex-col gap-2">
              <AddToListForm
                productId={p.id}
                productName={p.name}
                lists={userLists}
                loggedIn={Boolean(user)}
              />
              <Button variant="outline" asChild>
                <Link href="#alerta">
                  <Plus className="h-4 w-4" /> Criar alerta de preço
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Histórico de preços</CardTitle>
                <div className="flex flex-wrap gap-1.5 pt-2" role="group" aria-label="Período do gráfico">
                  {RANGES.map((r) => (
                    <Link
                      key={r.value}
                      href={`/produtos/${slug}?range=${r.value}`}
                      aria-current={range === r.value ? "true" : undefined}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium",
                        range === r.value
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {r.label}
                    </Link>
                  ))}
                </div>
                <p className="pt-1 text-xs text-muted-foreground">Últimos {days} dias.</p>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<Skeleton className="shimmer h-64 w-full sm:h-72" />}>
                  <PriceChart points={history} />
                </Suspense>
              </CardContent>
            </Card>

            {stats && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Estatísticas</CardTitle>
                </CardHeader>
                <CardContent>
                  <Estatisticas stats={stats} />
                </CardContent>
              </Card>
            )}

            <Card id="alerta" className="scroll-mt-20">
              <CardHeader>
                <CardTitle className="text-base">Criar alerta de preço</CardTitle>
              </CardHeader>
              <CardContent>
                <CreateAlertForm
                  productId={p.id}
                  markets={(marketsData ?? []) as { id: string; name: string }[]}
                />
              </CardContent>
            </Card>

            {/* Produtos similares */}
            <Suspense fallback={<Skeleton className="shimmer h-48 w-full" />}>
              <ProdutosSimilares product={p} excludeId={p.id} />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}