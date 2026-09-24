"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { marketColor, type PricePoint } from "@/lib/catalog/queries";
import { formatPriceBRL } from "@/lib/utils";
import { cn } from "@/lib/utils";

const Chart = dynamic(
  () =>
    import("recharts").then((m) => {
      const {
        Area,
        CartesianGrid,
        ComposedChart,
        Legend,
        Line,
        ResponsiveContainer,
        Tooltip,
        XAxis,
        YAxis,
      } = m;
      return {
        default: function ChartInner({
          rows,
          markets,
          hidden,
        }: {
          rows: Row[];
          markets: { slug: string; name: string }[];
          hidden: Set<string>;
        }) {
          const gradId = "mr-price-area";
          return (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--chart-line))" strokeDasharray="3 3" opacity={0.6} />
                <XAxis dataKey="data" tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  width={64}
                  tickFormatter={(v: number) =>
                    v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
                  }
                />
                <Tooltip
                  formatter={(value, name) => [
                    typeof value === "number" ? formatPriceBRL(value) : "—",
                    markets.find((mk) => mk.slug === name)?.name ?? name,
                  ]}
                  labelFormatter={(label) => `Dia ${label}`}
                />
                <Legend formatter={(v) => markets.find((mk) => mk.slug === v)?.name ?? v} />
                {/* Área = menor preço do dia (contexto); linhas = cada mercado */}
                <Area
                  type="monotone"
                  dataKey="__min"
                  name="Menor preço"
                  stroke="none"
                  fill={`url(#${gradId})`}
                  connectNulls
                />
                {markets
                  .filter((mk) => !hidden.has(mk.slug))
                  .map((mk, i) => (
                    <Line
                      key={mk.slug}
                      type="monotone"
                      dataKey={mk.slug}
                      name={mk.slug}
                      stroke={marketColor(mk.slug, i)}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
              </ComposedChart>
            </ResponsiveContainer>
          );
        },
      };
    }),
  { ssr: false, loading: () => <Skeleton className="shimmer h-64 w-full sm:h-72" /> },
);

const MAX_POINTS = 300;

type Row = { data: string; __min?: number; [market: string]: string | number | null | undefined };

function downsample(points: PricePoint[]): PricePoint[] {
  if (points.length <= MAX_POINTS) return points;
  const step = Math.ceil(points.length / MAX_POINTS);
  return points.filter((_, i) => i % step === 0);
}

function toRows(points: PricePoint[]): { rows: Row[]; markets: { slug: string; name: string }[] } {
  const markets: { slug: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const p of points) {
    if (!seen.has(p.market.slug)) {
      seen.add(p.market.slug);
      markets.push({ slug: p.market.slug, name: p.market.name });
    }
  }
  const rows: Row[] = downsample(points).map((p) => ({
    data: new Date(p.collected_at).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }),
    [p.market.slug]: p.promotional_price ?? p.price,
  }));
  // Mescla pontos do mesmo dia/mercado (mantém o último) + menor preço do dia.
  const merged = new Map<string, Row>();
  for (const r of rows) {
    const prev = merged.get(r.data);
    merged.set(r.data, { ...prev, ...r });
  }
  for (const r of merged.values()) {
    const vals = markets
      .map((mk) => r[mk.slug])
      .filter((v): v is number => typeof v === "number");
    if (vals.length > 0) r.__min = Math.min(...vals);
  }
  return { rows: [...merged.values()], markets };
}

/** Gráfico redesenhado: área (menor preço) + linhas por mercado, toggle por mercado. */
export function PriceChart({ points }: { points: PricePoint[] }) {
  const { rows, markets } = useMemo(() => toRows(points), [points]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function toggle(slug: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sem coletas neste período. Tente um intervalo maior.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mercados no gráfico">
        {markets.map((mk, i) => {
          const off = hidden.has(mk.slug);
          return (
            <button
              key={mk.slug}
              type="button"
              onClick={() => toggle(mk.slug)}
              aria-pressed={!off}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                off ? "opacity-50" : "hover:bg-accent",
              )}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: marketColor(mk.slug, i) }}
              />
              {mk.name}
            </button>
          );
        })}
      </div>
      <div className="h-64 w-full sm:h-72">
        <Chart rows={rows} markets={markets} hidden={hidden} />
      </div>
    </div>
  );
}
