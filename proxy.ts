import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: Parameters<typeof updateSession>[0]) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest|js)$).*)",
  ],
};
