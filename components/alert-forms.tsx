"use client";

import { useActionState } from "react";
import { BellOff, BellRing, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createAlert, deleteAlert, toggleAlert } from "@/lib/alerts/actions";

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function CreateAlertForm({
  productId,
  markets,
}: {
  productId: string;
  markets: { id: string; name: string }[];
}) {
  const [error, action, pending] = useActionState(createAlert, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="product_id" value={productId} />
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="alert-market">
          Mercado (opcional — vazio = todos)
        </label>
        <Select name="market_id" defaultValue="__all">
          <SelectTrigger id="alert-market">
            <SelectValue placeholder="Todos os mercados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos os mercados</SelectItem>
            {markets.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="alert-target">
            Preço-alvo (R$)
          </label>
          <Input
            id="alert-target"
            name="target_price"
            inputMode="decimal"
            placeholder="Ex.: 19,90"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="alert-drop">
            Queda % (ex.: 10)
          </label>
          <Input
            id="alert-drop"
            name="drop_percent"
            inputMode="decimal"
            placeholder="Ex.: 10"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="notify_lowest" className="h-4 w-4" />
        Avisar quando atingir o mínimo histórico
      </label>
      <Button type="submit" disabled={pending}>
        <BellRing className="h-4 w-4" /> Criar alerta
      </Button>
      <ErrorLine message={error} />
    </form>
  );
}

export function AlertRowActions({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const [, toggleAction, togglePending] = useActionState(toggleAlert, null);
  const [delError, delAction, delPending] = useActionState(deleteAlert, null);
  return (
    <span className="flex items-center gap-1">
      <form action={toggleAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="active" value={active ? "on" : ""} />
        <Button type="submit" variant="outline" size="sm" disabled={togglePending}>
          {active ? (
            <>
              <BellOff className="h-4 w-4" /> Pausar
            </>
          ) : (
            <>
              <BellRing className="h-4 w-4" /> Ativar
            </>
          )}
        </Button>
      </form>
      <form
        action={delAction}
        onSubmit={(e) => {
          if (!window.confirm("Excluir este alerta?")) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          className="text-destructive"
          aria-label="Excluir alerta"
          disabled={delPending}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </form>
      <ErrorLine message={delError} />
    </span>
  );
}
