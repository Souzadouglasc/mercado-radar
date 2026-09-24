import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FavoriteButton } from "@/components/favorite-button";
import { Price } from "@/components/price";
import type { LatestPrice, ProductRow } from "@/lib/catalog/queries";

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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-start justify-between gap-2 text-base">
          <Link href={`/produtos/${product.slug}`} className="hover:underline">
            {product.name}
          </Link>
          {favorite !== undefined && (
            <FavoriteButton
              targetType="product"
              targetId={product.id}
              initial={favorite}
            />
          )}
        </CardTitle>
        {product.brand && (
          <p className="text-xs text-muted-foreground">{product.brand}</p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {latest.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem preços ainda.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {latest.map((p) => {
              const isCheapest = cheapest?.market_id === p.market_id;
              return (
                <li
                  key={p.market_id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    {p.market.name}
                    {isCheapest && (
                      <Badge variant="default" className="text-[10px]">
                        Menor preço
                      </Badge>
                    )}
                  </span>
                  <Price value={effective(p)} />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
