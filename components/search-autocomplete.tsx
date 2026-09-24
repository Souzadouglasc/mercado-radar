"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Price } from "@/components/price";
import { cn } from "@/lib/utils";

type Hit = {
  id: string;
  name: string;
  brand: string | null;
  slug: string;
  minPrice: number | null;
  image_url: string | null;
};

/**
 * Busca global com autocomplete (header): /api/search, debounce 300ms +
 * AbortController. Enter vai para /buscar. Teclado: ↑↓ navegam, Esc fecha.
 */
export function SearchAutocomplete({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(timer.current);
    abort.current?.abort();
  }, []);

  function handleChange(next: string) {
    setQ(next);
    setActive(-1);
    window.clearTimeout(timer.current);
    abort.current?.abort();
    if (next.trim().length < 2) {
      setHits([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = window.setTimeout(async () => {
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(next.trim())}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error("http");
        const json = (await res.json()) as { results: Hit[] };
        setHits(json.results.slice(0, 8));
        setOpen(true);
      } catch {
        if (!ctrl.signal.aborted) {
          setHits([]);
          setOpen(false);
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 300);
  }

  function goSearch() {
    const term = q.trim();
    abort.current?.abort();
    setOpen(false);
    router.push(term ? `/buscar?q=${encodeURIComponent(term)}` : "/buscar");
  }

  return (
    <div ref={boxRef} className={cn("relative", compact ? "flex-1" : "w-full")}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls="mr-search-listbox"
          aria-activedescendant={active >= 0 ? `mr-search-opt-${active}` : undefined}
          aria-label="Buscar produtos"
          placeholder="Buscar produtos…"
          value={q}
          autoComplete="off"
          className="pl-9"
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && hits.length > 0) {
              e.preventDefault();
              setOpen(true);
              setActive((a) => (a + 1) % hits.length);
            } else if (e.key === "ArrowUp" && hits.length > 0) {
              e.preventDefault();
              setActive((a) => (a - 1 + hits.length) % hits.length);
            } else if (e.key === "Enter") {
              if (open && active >= 0 && hits[active]) {
                e.preventDefault();
                setOpen(false);
                router.push(`/produtos/${hits[active].slug}`);
              } else {
                e.preventDefault();
                goSearch();
              }
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {loading && (
          <span
            aria-hidden
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
          />
        )}
      </div>
      {open && hits.length > 0 && (
        <ul
          id="mr-search-listbox"
          role="listbox"
          aria-label="Sugestões de produtos"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-80 overflow-auto rounded-lg border bg-popover p-1 shadow-lg"
        >
          {hits.map((h, i) => (
            <li key={h.id} id={`mr-search-opt-${i}`} role="option" aria-selected={i === active}>
              <Link
                href={`/produtos/${h.slug}`}
                onClick={() => setOpen(false)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-2 text-sm",
                  i === active ? "bg-accent" : "hover:bg-accent",
                )}
              >
                {h.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={h.image_url}
                    alt=""
                    width={32}
                    height={32}
                    loading="lazy"
                    className="h-8 w-8 shrink-0 rounded-md bg-muted object-cover"
                  />
                ) : (
                  <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
                    {h.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{h.name}</span>
                  {h.brand && <span className="truncate text-xs text-muted-foreground">{h.brand}</span>}
                </span>
                {h.minPrice !== null && <Price value={h.minPrice} className="shrink-0 text-xs" />}
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={goSearch}
              className="w-full rounded-md px-2 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-accent"
            >
              Ver todos os resultados para “{q.trim()}” ↵
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
