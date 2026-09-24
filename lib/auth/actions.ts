"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function redirectTo(next: string) {
  return `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function signUp(_prev: string | null, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 6)
    return "Informe e-mail válido e senha com 6+ caracteres.";
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo("/conta") },
  });
  if (error) return traduzErro(error.message);
  redirect("/conta?ok=verifique-email");
}

export async function signIn(_prev: string | null, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return "Informe e-mail e senha.";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return traduzErro(error.message);
  redirect("/conta");
}

export async function signInMagicLink(_prev: string | null, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return "Informe seu e-mail.";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo("/conta") },
  });
  if (error) return traduzErro(error.message);
  redirect("/conta?ok=link-enviado");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/conta");
}

function traduzErro(message: string): string {
  if (/invalid login credentials/i.test(message))
    return "E-mail ou senha incorretos.";
  if (/user already registered/i.test(message))
    return "Este e-mail já está cadastrado. Faça login.";
  if (/rate limit/i.test(message))
    return "Muitas tentativas. Aguarde um minuto e tente de novo.";
  return "Não foi possível concluir. Tente novamente.";
}
