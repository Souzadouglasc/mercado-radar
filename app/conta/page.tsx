import type { Metadata } from "next";
import Link from "next/link";
import { Heart, ShieldCheck } from "lucide-react";
import { AuthForm } from "@/components/auth-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut } from "@/lib/auth/actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getProfile } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Minha conta",
  description: "Entre, crie sua conta e gerencie seus dados.",
};

export default async function ContaPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const { ok, erro } = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Minha conta</h1>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Login indisponível: o projeto Supabase ainda não foi conectado.
            Preencha <code>.env.local</code> (veja README).
          </CardContent>
        </Card>
      </div>
    );
  }

  const session = await getProfile();

  if (!session) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Minha conta</h1>
        {ok === "verifique-email" && (
          <p role="status" className="text-sm text-primary">
            Conta criada! Verifique seu e-mail para confirmar.
          </p>
        )}
        {ok === "link-enviado" && (
          <p role="status" className="text-sm text-primary">
            Link enviado! Abra seu e-mail para entrar.
          </p>
        )}
        {erro === "callback" && (
          <p role="alert" className="text-sm text-destructive">
            O link expirou ou é inválido. Tente novamente.
          </p>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Entrar ou criar conta</CardTitle>
          </CardHeader>
          <CardContent>
            <AuthForm />
          </CardContent>
        </Card>
      </div>
    );
  }

  const isAdmin = session.profile?.is_admin ?? false;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Minha conta</h1>
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <p className="text-sm">
            Logado como <strong>{session.user.email}</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/favoritos">
                <Heart className="h-4 w-4" /> Meus favoritos
              </Link>
            </Button>
            {isAdmin && (
              <Button variant="outline" asChild>
                <Link href="/admin">
                  <ShieldCheck className="h-4 w-4" /> Área do administrador
                </Link>
              </Button>
            )}
          </div>
          <form action={signOut}>
            <Button variant="ghost" type="submit">
              Sair
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
