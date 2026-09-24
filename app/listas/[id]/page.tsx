import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CircleAlert, PiggyBank, ShoppingBasket, Trophy, PackageSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Price } from "@/components/price";
import { ProductImage } from "@/components/product-image";
import {
  AddItemForm,
  DeleteListButton,
  QuantityStepper,
  RemoveItemButton,
  RenameListForm,
} from "@/components/list-forms";
import { latestPricesBatch } from "@/lib/catalog/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  bestSingleMarket,
  savingsVsSingleMarket,
  splitPurchase,
  totalsPerMarket,
  type BasketItem,
  type PriceEntry,
} from "@/lib/basket/calc";
import { formatPriceBRL } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Detalhe da lista",
  description: "Itens da lista e comparação do total por mercado.",
};

type Props = { params: Promise<{ id: string }> };

type ItemRow = {
  id: string;
  quantity: number;
  product: { id: string; name: string; slug: string; image_url?: string | null; brand?: string | null; unit?: string | null; quantity?: number | null };
};

async function Comparacao({ listId, items }: { listId: string; items: ItemRow[] }) {
  void listId;
  const supabase = await createClient();
  const { data: marketsData } = await supabase
    .from("markets")
    .select("id, name, slug")
    .eq("active", true)
    .order("name");
  const markets = ((marketsData ?? []) as { id: string; name: string; slug: string }[]).map(
    (m) => ({ marketId: m.id, marketName: m.name, marketSlug: m.slug }),
  );

  // Último preço de cada produto em cada mercado — 1 round-trip (RPC batch).
  const batch = await latestPricesBatch(
    supabase,
    items.map((i) => i.product.id),
  );
  const basket: BasketItem[] = items.map((i) => ({
    productId: i.product.id,
    productName: i.product.name,
    productSlug: i.product.slug,
    quantity: i.quantity,
  }));
  const priceEntries: PriceEntry[] = [];
  for (const item of items) {
    for (const lp of batch.get(item.product.id) ?? []) {
      const market = markets.find((m) => m.marketId === lp.market_id);
      if (!market) continue;
      priceEntries.push({
        productId: item.product.id,
        marketId: market.marketId,
        marketName: market.marketName,
        marketSlug: market.marketSlug,
        price: lp.promotional_price ?? lp.price,
      });
    }
  }

  const totals = totalsPerMarket(basket, priceEntries, markets).sort(
    (a, b) => a.total - b.total,
  );
  const best = bestSingleMarket(totals);
  const split = splitPurchase(basket, priceEntries);
  const savings = best ? savingsVsSingleMarket(split.total, best.total) : null;
  const anyMissing = totals.some((t) => t.unavailableItems.length > 0);

  return (
    <>
      {/* Header com total do vencedor + economia da dividida em destaque */}
      {best && (
        <Card className="border-2 border-primary bg-primary/5">
          <CardContent className="flex flex-col gap-1 pt-6">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Trophy className="h-4 w-4 text-primary" aria-hidden />
              {best.marketName} vence a lista
            </p>
            <p className="price-hero text-primary">
              <Price value={best.total} size="lg" className="price-hero" />
            </p>
            {savings && savings.amount > 0 ? (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                <PiggyBank className="h-4 w-4" aria-hidden />
                Dividindo a compra você economiza {formatPriceBRL(savings.amount)}
                {savings.percent !== null && ` (${savings.percent}%)`}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {best.availableCount} de {basket.length} itens com preço
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Comparação por mercado</h2>
        {best === null ? (
          <EmptyState
            icon={CircleAlert}
            title="Sem preços para comparar"
            description="Nenhum item da lista tem preço coletado. Lance preços no /admin."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {totals
              .filter((t) => t.availableCount > 0)
              .map((t) => {
                const isWinner = best.marketId === t.marketId;
                return (
                  <li key={t.marketId}>
                    <Card
                      className={
                        isWinner ? "border-2 border-primary" : undefined
                      }
                    >
                      <CardContent className="flex items-center justify-between gap-2 pt-6">
                        <span className="flex flex-col gap-1">
                          <span className="flex items-center gap-2 font-semibold">
                            {t.marketName}
                            {isWinner && (
                              <Badge className="gap-1 text-[10px]">
                                <Trophy className="h-3 w-3" aria-hidden /> Melhor preço
                              </Badge>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {t.availableCount} de {basket.length} itens com preço
                          </span>
                          {t.unavailableItems.length > 0 && (
                            <span className="text-xs text-offer">
                              ⚠ Faltando preço: {t.unavailableItems.join(", ")}
                            </span>
                          )}
                        </span>
                        <Price value={t.total} size="lg" />
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
          </ul>
        )}
        {anyMissing && (
          <p className="text-xs text-muted-foreground">
            Itens sem preço num mercado são excluídos do total desse mercado.
          </p>
        )}
      </section>

      {split.lines.length > 0 && best && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Compra dividida</h2>
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6">
              {split.byMarket.map((g) => (
                <div key={g.marketId} className="flex flex-col gap-1">
                  <p className="flex items-center justify-between text-sm">
                    <Link
                      href={`/mercados/${g.marketSlug}`}
                      className="font-semibold hover:underline"
                    >
                      {g.marketName}
                    </Link>
                    <Price value={g.subtotal} />
                  </p>
                  <ul className="flex flex-col gap-0.5 pl-2 text-xs text-muted-foreground">
                    {g.items.map((l) => (
                      <li key={l.productId}>
                        {l.quantity}× {l.productName} · {formatPriceBRL(l.unitPrice)} cada
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="border-t pt-3 text-sm">
                Total dividido: <Price value={split.total} /> ·{" "}
                {savings && savings.amount > 0 ? (
                  <span className="font-semibold text-primary">
                    economia de {formatPriceBRL(savings.amount)}
                    {savings.percent !== null && ` (${savings.percent}%)`} vs{" "}
                    {best.marketName}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    mesmo valor do melhor mercado único ({best.marketName})
                  </span>
                )}
              </p>
              {split.uncoveredItems.length > 0 && (
                <p className="text-xs text-offer">
                  ⚠ Sem preço em nenhum mercado: {split.uncoveredItems.join(", ")}
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      )}
    </>
  );
}

export default async function ListaPage({ params }: Props) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Lista</h1>
        <EmptyState
          icon={ShoppingBasket}
          title="Lista indisponível"
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

  const { data: list } = await supabase
    .from("shopping_lists")
    .select("id, name")
    .eq("id", id)
    .single();
  if (!list) notFound();
  const lista = list as { id: string; name: string };

  const { data: rawItems } = await supabase
    .from("shopping_list_items")
    .select("id, quantity, product:products(id, name, slug, image_url, brand, unit, quantity)")
    .eq("list_id", id)
    .order("created_at");
  const items: ItemRow[] = ((rawItems ?? []) as {
    id: string;
    quantity: number | string;
    product: { id: string; name: string; slug: string; image_url?: string | null; brand?: string | null; unit?: string | null; quantity?: number | null } | { id: string; name: string; slug: string; image_url?: string | null; brand?: string | null; unit?: string | null; quantity?: number | null }[];
  }[]).map((r) => ({
    id: r.id,
    quantity: Number(r.quantity),
    product: Array.isArray(r.product) ? r.product[0] : r.product,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/listas" className="text-sm text-muted-foreground hover:underline">
          ← Minhas listas
        </Link>
        <h1 className="text-2xl font-bold">{lista.name}</h1>
      </div>

      <RenameListForm id={lista.id} name={lista.name} />
      <AddItemForm listId={lista.id} />

      {items.length === 0 ? (
        <EmptyState
          icon={ShoppingBasket}
          title="Lista vazia"
          description="Adicione produtos acima para comparar o total da cesta por mercado."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Itens ({items.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-3">
                {items.map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <Link
                      href={`/produtos/${i.product.slug}`}
                      className="flex items-center gap-3 font-medium hover:underline"
                    >
                      <ProductImage
                        image_url={i.product.image_url}
                        product={{ name: i.product.name, brand: i.product.brand }}
                        aspect="square"
                        className="h-12 w-12 shrink-0"
                        alt={i.product.name}
                      />
                      <span className="truncate">{i.product.name}</span>
                    </Link>
                    <span className="flex items-center gap-1">
                      <QuantityStepper
                        itemId={i.id}
                        listId={lista.id}
                        quantity={i.quantity}
                        productName={i.product.name}
                      />
                      <RemoveItemButton itemId={i.id} listId={lista.id} productName={i.product.name} />
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
            </Card>

          <div className="flex flex-col gap-6">
          <Suspense
            fallback={
              <div className="flex flex-col gap-2" aria-hidden>
                <Skeleton className="shimmer h-28 w-full rounded-xl" />
                <Skeleton className="shimmer h-20 w-full rounded-xl" />
                <Skeleton className="shimmer h-20 w-full rounded-xl" />
              </div>
            }
          >
            <Comparacao listId={lista.id} items={items} />
          </Suspense>
          </div>
        </div>
      )}

      <DeleteListButton id={lista.id} />
    </div>
  );
}