"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { marketColor, type PricePoint } from "@/lib/catalog/queries";
import { formatPriceBRL } from "@/lib/utils";

const MAX_POINTS = 300;

type Row = { data: string; [market: string]: string | number | null };

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
  // Mescla pontos do mesmo dia/mercado (mantém o último).
  const merged = new Map<string, Row>();
  for (const r of rows) {
    const prev = merged.get(r.data);
    merged.set(r.data, { ...prev, ...r });
  }
  return { rows: [...merged.values()], markets };
}

export function PriceChart({ points }: { points: PricePoint[] }) {
  const { rows, markets } = useMemo(() => toRows(points), [points]);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sem coletas neste período. Tente um intervalo maior.
      </p>
    );
  }

  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
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
              markets.find((m) => m.slug === name)?.name ?? name,
            ]}
            labelFormatter={(label) => `Dia ${label}`}
          />
          <Legend formatter={(v) => markets.find((m) => m.slug === v)?.name ?? v} />
          {markets.map((m, i) => (
            <Line
              key={m.slug}
              type="monotone"
              dataKey={m.slug}
              name={m.slug}
              stroke={marketColor(m.slug, i)}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
