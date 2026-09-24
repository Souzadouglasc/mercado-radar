import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicEnv } from "./env";

function missingEnv(): never {
  throw new Error(
    "Supabase não configurado. Crie o projeto, rode as migrations e preencha .env.local (veja README).",
  );
}

/** Client autenticado do usuário (anon key + cookies). Uso em Server Components/Actions. */
export async function createClient() {
  const { url, anonKey } = supabasePublicEnv();
  if (!url || !anonKey) missingEnv();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Chamado de Server Component: escrita de cookie ignorada.
        }
      },
    },
  });
}

/**
 * Client privilegiado (service_role). SERVIDOR APENAS — nunca importar em
 * Client Components. Bypassa RLS: toda autorização deve ser verificada antes.
 */
export async function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) missingEnv();
  const cookieStore = await cookies();
  return createServerClient(url, serviceKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // service_role nunca persiste sessão em cookie.
      },
    },
  });
}

/** Retorna o perfil (id, is_admin) do usuário logado, ou null. */
export async function getProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, is_admin")
    .eq("id", user.id)
    .single();
  return { user, profile: data as { id: string; is_admin: boolean } | null };
}
