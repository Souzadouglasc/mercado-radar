import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ListChecks } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { CreateListForm } from "@/components/list-forms";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Minhas listas",
  description: "Monte listas de compras e compare o total por mercado.",
};

export default async function ListasPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Minhas listas</h1>
        <EmptyState
          icon={ListChecks}
          title="Listas indisponíveis"
          description="Conecte o Supabase (.env.local, veja README) para criar listas."
        />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/conta");

  const { data } = await supabase
    .from("shopping_lists")
    .select("id, name, created_at")
    .order("updated_at", { ascending: false });
  const lists = (data ?? []) as { id: string; name: string; created_at: string }[];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Minhas listas</h1>
      <CreateListForm />
      {lists.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Nenhuma lista ainda"
          description="Crie sua primeira lista acima e adicione produtos para comparar o total por mercado."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((l) => (
            <li key={l.id}>
              <Link href={`/listas/${l.id}`}>
                <Card className="transition-colors hover:bg-accent">
                  <CardContent className="flex items-center justify-between gap-2 pt-6">
                    <span className="font-semibold">{l.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(l.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
