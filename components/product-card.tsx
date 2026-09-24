import Link from "next/link";
import { TrendingDown, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FavoriteButton } from "@/components/favorite-button";
import { Price } from "@/components/price";
import { ProductImage } from "@/components/product-image";
import { marketColor, type LatestPrice, type ProductRow } from "@/lib/catalog/queries";
import { pricePerUnitFromProduct } from "@/lib/catalog/unit-price";
import { cn } from "@/lib/utils";

export type CanonicalProduct = {
  id: string;
  canonical_name: string;
  slug: string;
  brand: string | null;
  unit: string | null;
  quantity: number | null;
  image_url: string | null;
};

export function ProductCard({
  product,
  latest,
  favorite,
  variant = "default",
}: {
  product: ProductRow | CanonicalProduct;
  latest: LatestPrice[];
  favorite?: boolean;
  variant?: "default" | "compact";
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

  const isCompact = variant === "compact";

  // Get product name (handles both ProductRow and CanonicalProduct)
  const productName = "canonical_name" in product ? product.canonical_name : product.name;

  return (
    <Card
      className={cn(
        "group transition-all duration-200 card-elevated",
        isCompact && "p-3",
        !isCompact && "p-4",
      )}
    >
      {!isCompact && (
        <CardHeader className="pb-3">
          <CardTitle className="flex items-start justify-between gap-2 text-base">
            <Link
              href={`/produtos/${product.slug}`}
              className="flex min-w-0 items-center gap-3 hover:underline"
            >
              <ProductImage
                image_url={product.image_url}
                product={{ name: productName, brand: product.brand }}
                aspect="square"
                className="h-14 w-14 shrink-0"
                alt={productName}
              />
              <span className="min-w-0">
                <span className="block truncate font-medium">{productName}</span>
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
                label={`Favoritar ${productName}`}
              />
            )}
          </CardTitle>
          {discountVsAvg >= 5 && cheapest && (
            <p className="pt-1">
              <Badge variant="secondary" className="gap-1 text-[10px] text-offer">
                <TrendingDown className="h-3 w-3" aria-hidden />
                {discountVsAvg}% abaixo da média
              </Badge>
            </p>
          )}
        </CardHeader>
      )}

      <CardContent className="flex flex-col gap-2">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem preços ainda.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {sorted.map((p) => {
              const isCheapest = cheapest?.market_id === p.market_id;
              const pct = max > 0 ? Math.max(6, (effective(p) / max) * 100) : 0;
              return (
                <li key={p.market_id} className="flex flex-col gap-1 text-sm scale-hover">
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: marketColor(p.market.slug, 0) }}
                      />
                      <Link
                        href={`/mercados/${p.market.slug}`}
                        className="hover:underline font-medium"
                      >
                        {p.market.name}
                      </Link>
                      {isCheapest && (
                        <Badge variant="default" className="text-[10px] gap-1">
                          <Trophy className="h-3 w-3" aria-hidden />
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