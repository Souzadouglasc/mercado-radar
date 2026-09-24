import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PackageSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { FavoriteButton } from "@/components/favorite-button";
import { Price } from "@/components/price";
import { PriceChart } from "@/components/price-chart";
import { CreateAlertForm } from "@/components/alert-forms";
import {
  latestPrices,
  priceHistory,
  productStats,
  type HistoryRange,
} from "@/lib/catalog/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isFavorite } from "@/lib/favorites/actions";
import { formatPriceBRL } from "@/lib/utils";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string }>;
};

const RANGES: { value: HistoryRange; label: string }[] = [
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "6m", label: "6 meses" },
  { value: "1y", label: "1 ano" },
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
  };
}

function Estatisticas({
  stats,
}: {
  stats: NonNullable<Awaited<ReturnType<typeof productStats>>>;
}) {
  const variacao = stats.variation;
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
        <dd className="font-semibold">{formatPriceBRL(stats.average)}</dd>
      </div>
      <div className="rounded-lg border p-3">
        <dt className="text-muted-foreground">Mínimo histórico</dt>
        <dd className="font-semibold">{formatPriceBRL(stats.min)}</dd>
      </div>
      <div className="rounded-lg border p-3">
        <dt className="text-muted-foreground">Variação</dt>
        <dd
          className={
            variacao !== null && variacao < 0 ? "font-semibold text-primary" : "font-semibold"
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
    .select("id, name, slug, brand, unit, quantity")
    .eq("slug", slug)
    .eq("active", true)
    .single();
  if (!product) notFound();
  const p = product as {
    id: string;
    name: string;
    brand: string | null;
    unit: string | null;
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
  const effective = (x: (typeof latest)[number]) => x.promotional_price ?? x.price;
  const cheapest =
    latest.length > 0
      ? latest.reduce((a, b) => (effective(a) <= effective(b) ? a : b))
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">{p.name}</h1>
          {p.brand && <p className="text-sm text-muted-foreground">{p.brand}</p>}
        </div>
        <FavoriteButton targetType="product" targetId={p.id} initial={fav} />
      </div>

      {latest.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="Preços ainda não coletados"
          description="Lance um preço manual no /admin ou aguarde a coleta automática (Fase 4)."
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preços por mercado</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {latest.map((x) => (
                  <li
                    key={x.market_id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="flex flex-col">
                      <span className="flex items-center gap-2 font-medium">
                        {x.market.name}
                        {cheapest?.market_id === x.market_id && (
                          <Badge className="text-[10px]">Menor preço</Badge>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(x.collected_at).toLocaleString("pt-BR")}
                      </span>
                    </span>
                    <span className="flex flex-col items-end">
                      {x.promotional_price !== null && (
                        <s className="text-xs text-muted-foreground">
                          {formatPriceBRL(x.price)}
                        </s>
                      )}
                      <Price value={effective(x)} />
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico de preços</CardTitle>
              <div className="flex flex-wrap gap-1.5 pt-2" role="group" aria-label="Período">
                {RANGES.map((r) => (
                  <Link
                    key={r.value}
                    href={`/produtos/${slug}?range=${r.value}`}
                    aria-current={range === r.value ? "true" : undefined}
                    className={
                      range === r.value
                        ? "rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                        : "rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
                    }
                  >
                    {r.label}
                  </Link>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <PriceChart points={history} />
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

          <Card>
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
        </>
      )}
    </div>
  );
}
