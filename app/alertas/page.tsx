import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, BellRing } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { AlertRowActions } from "@/components/alert-forms";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { formatPriceBRL } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Alertas de preço",
  description: "Receba avisos quando o preço de um produto cair.",
};

type AlertRow = {
  id: string;
  product_id: string;
  market_id: string | null;
  target_price: number | string | null;
  drop_percent: number | string | null;
  notify_lowest: boolean;
  active: boolean;
  created_at: string;
};

function describe(a: AlertRow): string {
  const parts: string[] = [];
  if (a.target_price !== null) parts.push(`abaixo de ${formatPriceBRL(Number(a.target_price))}`);
  if (a.drop_percent !== null) parts.push(`queda de ${Number(a.drop_percent)}%`);
  if (a.notify_lowest) parts.push("mínimo histórico");
  return parts.join(" · ") || "—";
}

export default async function AlertasPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Alertas de preço</h1>
        <EmptyState
          icon={Bell}
          title="Alertas indisponíveis"
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

  const [{ data: alertsData }, { data: notifsData }] = await Promise.all([
    supabase
      .from("price_alerts")
      .select("id, product_id, market_id, target_price, drop_percent, notify_lowest, active, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("notifications")
      .select("id, title, message, read, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const alerts = (alertsData ?? []) as AlertRow[];
  const notifs = (notifsData ?? []) as {
    id: string;
    title: string;
    message: string;
    read: boolean;
    created_at: string;
  }[];

  const productIds = [...new Set(alerts.map((a) => a.product_id))];
  const marketIds = [...new Set(alerts.map((a) => a.market_id).filter((x): x is string => Boolean(x)))];
  const [{ data: products }, { data: markets }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name, slug").in("id", productIds)
      : Promise.resolve({ data: [] as unknown[] }),
    marketIds.length > 0
      ? supabase.from("markets").select("id, name").in("id", marketIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const productMap = new Map(
    ((products ?? []) as { id: string; name: string; slug: string }[]).map((p) => [p.id, p]),
  );
  const marketMap = new Map(
    ((markets ?? []) as { id: string; name: string }[]).map((m) => [m.id, m]),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Alertas de preço</h1>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Meus alertas</h2>
        {alerts.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Nenhum alerta criado"
            description="Abra um produto e crie um alerta com preço-alvo, queda % ou mínimo histórico."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {alerts.map((a) => {
              const p = productMap.get(a.product_id);
              const m = a.market_id ? marketMap.get(a.market_id) : null;
              return (
                <li key={a.id}>
                  <Card>
                    <CardContent className="flex items-center justify-between gap-2 pt-6">
                      <span className="flex flex-col gap-1 text-sm">
                        <span className="flex items-center gap-2">
                          {p ? (
                            <Link
                              href={`/produtos/${p.slug}`}
                              className="font-semibold hover:underline"
                            >
                              {p.name}
                            </Link>
                          ) : (
                            <span className="font-semibold">Produto removido</span>
                          )}
                          <Badge variant={a.active ? "default" : "secondary"}>
                            {a.active ? "Ativo" : "Pausado"}
                          </Badge>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {describe(a)}
                          {m ? ` · ${m.name}` : " · todos os mercados"}
                        </span>
                      </span>
                      <AlertRowActions id={a.id} active={a.active} />
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Notificações</h2>
        {notifs.length === 0 ? (
          <EmptyState
            icon={BellRing}
            title="Nenhuma notificação ainda"
            description="Quando um alerta disparar, o aviso aparece aqui. O envio por e-mail chega na Fase 5."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {notifs.map((n) => (
              <li key={n.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {n.title}
                      {!n.read && <Badge>Nova</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(n.created_at).toLocaleString("pt-BR")}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground lg:col-span-2">
        Alertas disparam na coleta diária (Fase 5). Sem envio de e-mail nesta versão.
      </p>
      </div>
    </div>
  );
}
