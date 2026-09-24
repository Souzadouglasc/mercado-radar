"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, signInMagicLink } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Modo = "entrar" | "cadastrar" | "magico";

const TITULOS: Record<Modo, string> = {
  entrar: "Entrar",
  cadastrar: "Criar conta",
  magico: "Receber link por e-mail",
};

export function AuthForm() {
  const [modo, setModo] = useState<Modo>("entrar");
  const action =
    modo === "entrar" ? signIn : modo === "cadastrar" ? signUp : signInMagicLink;
  const [erro, formAction, pendente] = useActionState(action, null as string | null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2" role="tablist" aria-label="Modo de acesso">
        {(Object.keys(TITULOS) as Modo[]).map((m) => (
          <Button
            key={m}
            type="button"
            variant={modo === m ? "default" : "outline"}
            size="sm"
            onClick={() => setModo(m)}
          >
            {TITULOS[m]}
          </Button>
        ))}
      </div>
      <form action={formAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          E-mail
          <Input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="voce@exemplo.com"
          />
        </label>
        {modo !== "magico" && (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Senha
            <Input
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={modo === "entrar" ? "current-password" : "new-password"}
              placeholder="Mínimo 6 caracteres"
            />
          </label>
        )}
        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
        <Button type="submit" disabled={pendente}>
          {pendente ? "Aguarde…" : TITULOS[modo]}
        </Button>
        {modo === "magico" && (
          <p className="text-sm text-muted-foreground">
            Enviamos um link de acesso para seu e-mail. Sem senha.
          </p>
        )}
      </form>
    </div>
  );
}
