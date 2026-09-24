"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthStatus } from "@/components/auth-status";
import { LogoMark } from "@/components/logo";
import { SearchAutocomplete } from "@/components/search-autocomplete";
import { cn } from "@/lib/utils";

const links = [
  { href: "/buscar", label: "Buscar" },
  { href: "/ofertas", label: "Ofertas" },
  { href: "/listas", label: "Listas" },
  { href: "/alertas", label: "Alertas" },
  { href: "/favoritos", label: "Favoritos" },
];

export function SiteHeader() {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:gap-6 lg:px-10">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-bold" aria-label="MercadoRadar — início">
          <LogoMark />
          <span className="hidden text-[15px] tracking-tight sm:inline">Mercado<span className="text-primary">Radar</span></span>
        </Link>
        <nav aria-label="Navegação principal" className="hidden items-center gap-1 lg:flex">
          {links.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-foreground",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto hidden w-full max-w-xs xl:block"><SearchAutocomplete compact /></div>
        <AuthStatus />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Alternar tema claro/escuro"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </div>
    </header>
  );
}
