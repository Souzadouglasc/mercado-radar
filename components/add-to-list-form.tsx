"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addItem } from "@/lib/lists/actions";

/** CTA "adicionar à lista" na página do produto (server action existente). */
export function AddToListForm({
  productId,
  productName,
  lists,
  loggedIn,
}: {
  productId: string;
  productName: string;
  lists: { id: string; name: string }[];
  loggedIn: boolean;
}) {
  const [error, action, pending] = useActionState(addItem, null);
  if (!loggedIn) {
    return (
      <Button asChild>
        <Link href="/conta">
          <ListPlus className="h-4 w-4" /> Entrar para adicionar à lista
        </Link>
      </Button>
    );
  }
  if (lists.length === 0) {
    return (
      <Button asChild>
        <Link href="/listas">
          <ListPlus className="h-4 w-4" /> Criar lista para adicionar
        </Link>
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="product_id" value={productId} />
      <div className="flex gap-2">
        <Select name="list_id" defaultValue={lists[0].id}>
          <SelectTrigger aria-label={`Adicionar ${productName} à lista`} className="flex-1">
            <SelectValue placeholder="Escolha a lista" />
          </SelectTrigger>
          <SelectContent>
            {lists.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input name="quantity" type="number" min={0.1} step={0.5} defaultValue={1} aria-label="Quantidade" className="w-20" />
        <Button type="submit" disabled={pending}>
          <ListPlus className="h-4 w-4" /> Adicionar
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
