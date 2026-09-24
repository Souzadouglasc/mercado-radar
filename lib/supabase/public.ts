import { createClient as createJsClient } from "@supabase/supabase-js";
import { supabasePublicEnv } from "./env";

/**
 * Client anônimo sem cookies — leitura pública do catálogo.
 * Uso em funções com unstable_cache (cookies() inviabiliza cache).
 */
export function createPublicClient() {
  const { url, anonKey } = supabasePublicEnv();
  return createJsClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
