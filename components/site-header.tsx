"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { Moon, Radar, Search, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthStatus } from "@/components/auth-status";

export function SiteHeader() {
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Radar className="h-5 w-5" />
          </span>
          <span className="hidden sm:inline">MercadoRadar</span>
        </Link>
        <form
          className="relative flex-1"
          role="search"
          action="/buscar"
          onSubmit={(e) => {
            const data = new FormData(e.currentTarget);
            if (!String(data.get("q") ?? "").trim()) e.preventDefault();
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            type="search"
            placeholder="Buscar produtos…"
            aria-label="Buscar produtos"
            className="pl-9"
          />
        </form>
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
