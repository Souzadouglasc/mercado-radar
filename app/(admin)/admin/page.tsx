import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Badge } from "@/components/ui/badge";
import {
  CategoryForm,
  DeleteButton,
  ManualPriceForm,
  MarketForm,
  ProductForm,
  type CategoryOpt,
  type MarketOpt,
  type ProductOpt,
} from "@/components/admin-forms";
import { requireAdmin } from "@/lib/admin/guard";
import { deleteRow } from "@/lib/admin/actions";

export const metadata: Metadata = {
  title: "Admin",
  description: "Administração do catálogo MercadoRadar.",
  robots: { index: false, follow: false },
};

type Search = { tab?: string };

async function deleteMarket(formData: FormData) {
  "use server";
  await deleteRow("markets", String(formData.get("id") ?? ""));
  revalidatePath("/admin");
}

async function deleteCategory(formData: FormData) {
  "use server";
  await deleteRow("categories", String(formData.get("id") ?? ""));
  revalidatePath("/admin");
}

async function deleteProduct(formData: FormData) {
  "use server";
  await deleteRow("products", String(formData.get("id") ?? ""));
  revalidatePath("/admin");
}

const TABS = [
  { key: "mercados", label: "Mercados" },
  { key: "categorias", label: "Categorias" },
  { key: "produtos", label: "Produtos" },
  { key: "precos", label: "Preços manuais" },
] as const;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { tab = "mercados" } = await searchParams;
  const { admin } = await requireAdmin();

  const [{ data: markets }, { data: categories }, { data: products }] =
    await Promise.all([
      admin.from("markets").select("id, name, slug, website_url").order("name"),
      admin.from("categories").select("id, name, slug").order("name"),
      admin
        .from("products")
        .select("id, name, slug, brand")
        .order("name")
        .limit(100),
    ]);
  const marketOpts = (markets ?? []) as (MarketOpt & { website_url: string | null })[];
  const categoryOpts = (categories ?? []) as CategoryOpt[];
  const productOpts = (products ?? []) as (ProductOpt & { brand: string | null })[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Admin</h1>
        <Link href="/admin/runs" className="text-sm underline">
          Ver runs de coleta
        </Link>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Seções do admin">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={
              tab === t.key
                ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                : "rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "mercados" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Mercados</h2>
          <MarketForm />
          <ul className="flex flex-col gap-2">
            {marketOpts.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <strong>{m.name}</strong>
                  <Badge variant="outline">{m.slug}</Badge>
                </span>
                <span className="flex items-center gap-1">
                  <Link href={`/mercados/${m.slug}`} className="text-xs underline">
                    Ver
                  </Link>
                  <DeleteButton id={m.id} label={m.name} action={deleteMarket} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "categorias" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Categorias</h2>
          <CategoryForm />
          <ul className="flex flex-col gap-2">
            {categoryOpts.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <strong>{c.name}</strong>
                  <Badge variant="outline">{c.slug}</Badge>
                </span>
                <DeleteButton id={c.id} label={c.name} action={deleteCategory} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "produtos" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Produtos (+aliases)</h2>
          <ProductForm markets={marketOpts} categories={categoryOpts} />
          <ul className="flex flex-col gap-2">
            {productOpts.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <Link href={`/produtos/${p.slug}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  {p.brand && (
                    <span className="text-xs text-muted-foreground">{p.brand}</span>
                  )}
                </span>
                <DeleteButton id={p.id} label={p.name} action={deleteProduct} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "precos" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Lançamento de preço manual</h2>
          <ManualPriceForm markets={marketOpts} products={productOpts} />
        </section>
      )}
    </div>
  );
}
