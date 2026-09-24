"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthStatus } from "@/components/auth-status";
import { LogoMark } from "@/components/logo";
import { SearchAutocomplete } from "@/components/search-autocomplete";

export function SiteHeader() {
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-bold" aria-label="MercadoRadar — início">
          <LogoMark />
          <span className="hidden sm:inline">MercadoRadar</span>
        </Link>
        <SearchAutocomplete compact />
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
