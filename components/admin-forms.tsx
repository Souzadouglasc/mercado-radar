"use client";

import { useActionState } from "react";
import { addManualPrice, upsertCategory, upsertMarket, upsertProduct } from "@/lib/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function Erro({ erro }: { erro: string | null }) {
  if (!erro) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {erro}
    </p>
  );
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

function NativeSelect({
  name,
  required,
  placeholder,
  children,
}: {
  name: string;
  required?: boolean;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <select name={name} required={required} defaultValue="" className={cn(selectClass)}>
      <option value="" disabled>
        {placeholder}
      </option>
      {children}
    </select>
  );
}

export type MarketOpt = { id: string; name: string; slug: string };
export type CategoryOpt = { id: string; name: string; slug: string };
export type ProductOpt = { id: string; name: string; slug: string };

export function MarketForm({ market }: { market?: MarketOpt & { website_url?: string | null } }) {
  const [erro, action, pendente] = useActionState(upsertMarket, null);
  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border p-4">
      {market && <input type="hidden" name="id" value={market.id} />}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input name="name" placeholder="Nome *" defaultValue={market?.name} required />
        <Input name="slug" placeholder="slug (auto)" defaultValue={market?.slug} />
        <Input name="website_url" placeholder="Site" defaultValue={market?.website_url ?? ""} />
        <Input name="city" placeholder="Cidade" />
        <Input name="osuper_api_url" placeholder="Osuper GraphQL URL" className="sm:col-span-2" />
        <Input name="osuper_store_id" placeholder="Osuper storeId" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked /> Ativo
        </label>
      </div>
      <Erro erro={erro} />
      <Button type="submit" disabled={pendente} size="sm">
        {pendente ? "Salvando…" : market ? "Atualizar mercado" : "Adicionar mercado"}
      </Button>
    </form>
  );
}

export function CategoryForm() {
  const [erro, action, pendente] = useActionState(upsertCategory, null);
  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input name="name" placeholder="Nome *" required />
        <Input name="slug" placeholder="slug (auto)" />
      </div>
      <Erro erro={erro} />
      <Button type="submit" disabled={pendente} size="sm">
        {pendente ? "Salvando…" : "Adicionar categoria"}
      </Button>
    </form>
  );
}

export function ProductForm({
  markets,
  categories,
}: {
  markets: MarketOpt[];
  categories: CategoryOpt[];
}) {
  const [erro, action, pendente] = useActionState(upsertProduct, null);
  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input name="name" placeholder="Nome canônico *" required className="sm:col-span-2" />
        <Input name="slug" placeholder="slug (auto)" />
        <Input name="brand" placeholder="Marca" />
        <Input name="barcode" placeholder="Código de barras" />
        <Input name="unit" placeholder="Unidade (ex.: un, kg, L)" />
        <Input name="quantity" placeholder="Quantidade (ex.: 1, 500)" inputMode="decimal" />
        <label className="flex flex-col gap-1 text-sm">
          Categoria
          <NativeSelect name="category_id" placeholder="Selecione…">
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Alias: mercado de origem
          <NativeSelect name="alias_market_id" placeholder="Opcional…">
            {markets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Input
          name="alias_raw_name"
          placeholder="Alias: nome cru no mercado (opcional)"
          className="sm:col-span-2"
        />
      </div>
      <Erro erro={erro} />
      <Button type="submit" disabled={pendente} size="sm">
        {pendente ? "Salvando…" : "Adicionar produto"}
      </Button>
    </form>
  );
}

export function ManualPriceForm({
  markets,
  products,
}: {
  markets: MarketOpt[];
  products: ProductOpt[];
}) {
  const [erro, action, pendente] = useActionState(addManualPrice, null);
  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Produto *
          <NativeSelect name="product_id" required placeholder="Selecione…">
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Mercado *
          <NativeSelect name="market_id" required placeholder="Selecione…">
            {markets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Input name="price" placeholder="Preço * (ex.: 9,90)" required inputMode="decimal" />
        <Input
          name="promotional_price"
          placeholder="Preço promocional (opcional)"
          inputMode="decimal"
        />
        <Input
          name="source_url"
          placeholder="URL de origem (opcional)"
          className="sm:col-span-2"
        />
      </div>
      <p className="text-xs text-muted-foreground">Fonte registrada como “manual”.</p>
      <Erro erro={erro} />
      <Button type="submit" disabled={pendente} size="sm">
        {pendente ? "Lançando…" : "Lançar preço"}
      </Button>
    </form>
  );
}

export function DeleteButton({
  id,
  label,
  action,
}: {
  id: string;
  label: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        aria-label={`Excluir ${label}`}
        onClick={(e) => {
          if (!confirm(`Excluir “${label}”?`)) e.preventDefault();
        }}
      >
        Excluir
      </Button>
    </form>
  );
}
