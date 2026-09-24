"use client";

import { useActionState, useState, useTransition } from "react";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addItem,
  createList,
  deleteList,
  removeItem,
  renameList,
  setItemQuantity,
} from "@/lib/lists/actions";

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function CreateListForm() {
  const [error, action, pending] = useActionState(createList, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          name="name"
          placeholder="Ex.: Compra do mês"
          aria-label="Nome da lista"
          maxLength={80}
          required
          className="flex-1"
        />
        <Button type="submit" disabled={pending}>
          Criar
        </Button>
      </div>
      <ErrorLine message={error} />
    </form>
  );
}

export function RenameListForm({ id, name }: { id: string; name: string }) {
  const [error, action, pending] = useActionState(renameList, null);
  const [value, setValue] = useState(name);
  return (
    <form action={action} className="flex gap-2">
      <input type="hidden" name="id" value={id} />
      <Input
        name="name"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Renomear lista"
        maxLength={80}
        className="flex-1"
      />
      <Button type="submit" variant="outline" disabled={pending || !value.trim()}>
        Salvar
      </Button>
      <ErrorLine message={error} />
    </form>
  );
}

export function DeleteListButton({ id }: { id: string }) {
  const [error, action, pending] = useActionState(deleteList, null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Excluir esta lista?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        <Trash2 className="h-4 w-4" /> Excluir lista
      </Button>
      <ErrorLine message={error} />
    </form>
  );
}

export function AddItemForm({ listId }: { listId: string }) {
  const [error, action, pending] = useActionState(addItem, null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string; brand: string | null }[]
  >([]);
  const [selected, setSelected] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [timer, setTimer] = useState<number | undefined>(undefined);

  async function search(next: string) {
    setQuery(next);
    window.clearTimeout(timer);
    if (next.trim().length < 2) {
      setResults([]);
      return;
    }
    setTimer(
      window.setTimeout(async () => {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(next.trim())}`,
        );
        if (res.ok) {
          const json = (await res.json()) as {
            results: { id: string; name: string; brand: string | null }[];
          };
          setResults(json.results);
        }
      }, 350),
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="list_id" value={listId} />
      <input type="hidden" name="product_id" value={selected?.id ?? ""} />
      <label className="text-sm font-medium" htmlFor="add-item-q">
        Adicionar produto
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="add-item-q"
          value={selected ? selected.name : query}
          onChange={(e) => {
            setSelected(null);
            void search(e.target.value);
          }}
          placeholder="Buscar por nome ou marca…"
          autoComplete="off"
          className="pl-9"
        />
        {selected && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2"
            onClick={() => {
              setSelected(null);
              setQuery("");
              setResults([]);
            }}
          >
            Limpar
          </Button>
        )}
      </div>
      {!selected && results.length > 0 && (
        <ul className="flex max-h-48 flex-col gap-1 overflow-auto rounded-lg border p-1">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  setSelected({ id: r.id, name: r.name });
                  setResults([]);
                }}
              >
                <span className="font-medium">{r.name}</span>
                {r.brand && (
                  <span className="text-muted-foreground"> · {r.brand}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          name="quantity"
          type="number"
          min={0.1}
          step={0.5}
          defaultValue={1}
          aria-label="Quantidade"
          className="w-24"
        />
        <Button type="submit" disabled={pending || !selected}>
          Adicionar
        </Button>
      </div>
      <ErrorLine message={error} />
    </form>
  );
}

export function RemoveItemButton({
  itemId,
  listId,
  productName,
}: {
  itemId: string;
  listId: string;
  productName: string;
}) {
  const [, removeAction] = useActionState(removeItem, null);
  const [busy, start] = useTransition();

  function remove() {
    const fd = new FormData();
    fd.set("id", itemId);
    fd.set("list_id", listId);
    start(() => removeAction(fd));
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-destructive"
      aria-label={`Remover ${productName} da lista`}
      disabled={busy}
      onClick={() => {
        if (window.confirm("Remover este item?")) remove();
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

export function QuantityStepper({
  itemId,
  listId,
  quantity,
  productName = "item",
}: {
  itemId: string;
  listId: string;
  quantity: number;
  productName?: string;
}) {
  const [, setAction] = useActionState(setItemQuantity, null);
  const [, removeAction] = useActionState(removeItem, null);
  const [busy, start] = useTransition();

  function set(qty: number) {
    const fd = new FormData();
    fd.set("id", itemId);
    fd.set("list_id", listId);
    fd.set("quantity", String(Math.round(qty * 100) / 100));
    start(() => setAction(fd));
  }

  function remove() {
    const fd = new FormData();
    fd.set("id", itemId);
    fd.set("list_id", listId);
    start(() => removeAction(fd));
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border p-0.5" role="group" aria-label={`Quantidade de ${productName}`}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full"
        aria-label={`Diminuir quantidade de ${productName}`}
        disabled={busy}
        onClick={() => (quantity > 1 ? set(quantity - 1) : remove())}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <span className="w-10 text-center text-sm font-semibold tabular-nums" aria-live="polite" aria-label={`Quantidade: ${quantity}`}>
        {quantity}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full"
        aria-label={`Aumentar quantidade de ${productName}`}
        disabled={busy}
        onClick={() => set(quantity + 1)}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </span>
  );
}
