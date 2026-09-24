"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

export function AuthStatus() {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(!CONFIGURED);

  useEffect(() => {
    if (!CONFIGURED) return;
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => {
        setEmail(data.user?.email ?? null);
        setReady(true);
      })
      .catch(() => setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready)
    return (
      <Button variant="ghost" size="icon" aria-label="Conta" disabled>
        <UserRound className="h-5 w-5" />
      </Button>
    );

  return (
    <Button variant="ghost" size="icon" asChild aria-label={email ? `Conta (${email})` : "Entrar"}>
      <Link href="/conta">
        <UserRound className="h-5 w-5" />
      </Link>
    </Button>
  );
}
