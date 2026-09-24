import Image from "next/image";
import Link from "next/link";
import { TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FavoriteButton } from "@/components/favorite-button";
import { Price } from "@/components/price";
import { marketColor, type LatestPrice, type ProductRow } from "@/lib/catalog/queries";
import { pricePerUnitFromProduct } from "@/lib/catalog/unit-price";

export function ProductCard({
  product,
  latest,
  favorite,
}: {
  product: ProductRow;
  latest: LatestPrice[];
  favorite?: boolean;
}) {
  const effective = (p: LatestPrice) => p.promotional_price ?? p.price;
  const cheapest =
    latest.length > 0
      ? latest.reduce((a, b) => (effective(a) <= effective(b) ? a : b))
      : null;
  const sorted = [...latest].sort((a, b) => effective(a) - effective(b));
  const max = sorted.length > 0 ? effective(sorted[sorted.length - 1]) : 0;
  const avg =
    sorted.length > 0
      ? sorted.reduce((s, p) => s + effective(p), 0) / sorted.length
      : 0;
  const discountVsAvg =
    cheapest && avg > 0
      ? Math.round(((avg - effective(cheapest)) / avg) * 100)
      : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-start justify-between gap-2 text-base">
          <Link
            href={`/produtos/${product.slug}`}
            className="flex min-w-0 items-center gap-2 hover:underline"
          >
            {product.image_url ? (
              <Image
                src={product.image_url}
                alt=""
                width={40}
                height={40}
                sizes="40px"
                loading="lazy"
                className="h-10 w-10 shrink-0 rounded-md bg-muted object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-bold text-muted-foreground"
              >
                {product.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate">{product.name}</span>
              {product.brand && (
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {product.brand}
                </span>
              )}
            </span>
          </Link>
          {favorite !== undefined && (
            <FavoriteButton
              targetType="product"
              targetId={product.id}
              initial={favorite}
              label={`Favoritar ${product.name}`}
            />
          )}
        </CardTitle>
        {discountVsAvg >= 5 && cheapest && (
          <p>
            <Badge variant="secondary" className="gap-1 text-[10px] text-offer">
              <TrendingDown className="h-3 w-3" aria-hidden />
              {discountVsAvg}% abaixo da média
            </Badge>
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem preços ainda.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {sorted.map((p) => {
              const isCheapest = cheapest?.market_id === p.market_id;
              const pct = max > 0 ? Math.max(6, (effective(p) / max) * 100) : 0;
              return (
                <li key={p.market_id} className="flex flex-col gap-1 text-sm">
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: marketColor(p.market.slug, 0) }}
                      />
                      <Link
                        href={`/mercados/${p.market.slug}`}
                        className="hover:underline"
                      >
                        {p.market.name}
                      </Link>
                      {isCheapest && (
                        <Badge variant="default" className="text-[10px]">
                          Menor preço
                        </Badge>
                      )}
                    </span>
                    <span className="flex items-baseline gap-1.5">
                      <Price value={effective(p)} className={isCheapest ? "text-primary" : undefined} />
                      {(() => {
                        const up = pricePerUnitFromProduct(effective(p), product);
                        return up ? (
                          <span className="text-[10px] text-muted-foreground font-normal">
                            {up.label}
                          </span>
                        ) : null;
                      })()}
                    </span>
                  </span>
                  {/* Barra comparativa de preços por mercado */}
                  <span
                    aria-hidden
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: isCheapest
                          ? "hsl(var(--primary))"
                          : marketColor(p.market.slug, 0),
                        opacity: isCheapest ? 1 : 0.55,
                      }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
