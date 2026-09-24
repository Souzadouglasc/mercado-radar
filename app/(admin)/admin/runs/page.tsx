import type { Metadata } from "next";
import Link from "next/link";
import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { requireAdmin } from "@/lib/admin/guard";

export const metadata: Metadata = {
  title: "Runs de coleta",
  description: "Histórico de execuções da coleta automática.",
  robots: { index: false, follow: false },
};

type Run = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  products_found: number;
  products_valid: number;
  products_ignored: number;
  products_new: number;
  products_updated: number;
  error_summary: string | null;
  duration_ms: number | null;
  market: { name: string; slug: string } | null;
};

export default async function RunsPage() {
  const { admin } = await requireAdmin();
  const { data } = await admin
    .from("scrape_runs")
    .select(
      "id, started_at, finished_at, status, products_found, products_valid, products_ignored, products_new, products_updated, error_summary, duration_ms, market:markets(name, slug)",
    )
    .order("started_at", { ascending: false })
    .limit(50);
  const runs = ((data ?? []) as unknown as (Omit<Run, "market"> & {
    market: Run["market"] | Run["market"][];
  })[]).map((r) => ({
    ...r,
    market: Array.isArray(r.market) ? (r.market[0] ?? null) : r.market,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Link href="/admin" className="text-sm underline">
          ← Admin
        </Link>
      </div>
      <h1 className="text-2xl font-bold">Runs de coleta</h1>
      {runs.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Nenhuma coleta registrada"
          description="As execuções aparecem aqui quando o scraper (Fase 4) chamar POST /api/ingest/prices."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {runs.map((r) => (
            <li key={r.id}>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Badge
                      variant={r.status === "SUCCESS" ? "default" : "secondary"}
                    >
                      {r.status}
                    </Badge>
                    {r.market?.name ?? "Geral"}
                    <span className="font-normal text-muted-foreground">
                      {new Date(r.started_at).toLocaleString("pt-BR")}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  encontrados {r.products_found} · válidos {r.products_valid} ·
                  ignorados {r.products_ignored} · novos {r.products_new} ·
                  atualizados {r.products_updated}
                  {r.duration_ms !== null && ` · ${r.duration_ms} ms`}
                  {r.error_summary && <p className="mt-1">{r.error_summary}</p>}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
