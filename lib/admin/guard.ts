import { notFound } from "next/navigation";
import { createServiceRoleClient, getProfile } from "@/lib/supabase/server";

/**
 * Guarda do /admin. Não-admin (ou deslogado) recebe 404 — sem vazar existência.
 * Retorna client service_role (SERVIDOR) para as actions após verificar admin.
 */
export async function requireAdmin() {
  const session = await getProfile().catch(() => null);
  if (!session?.profile?.is_admin) notFound();
  const admin = await createServiceRoleClient();
  return { user: session.user, admin };
}
