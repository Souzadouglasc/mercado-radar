"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Suspense } from "react";
import { Search, Filter, ChevronDown, Layers, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Price } from "@/components/price";
import { ProductCard } from "@/components/product-card";
import { SearchAutocomplete } from "@/components/search-autocomplete";
import { ProductImage } from "@/components/product-image";
import { getCachedSearch } from "@/lib/catalog/cached";
import { searchProducts, type ProductRow, type LatestPrice, type CityFilter } from "@/lib/catalog/queries";
import { pricePerUnitFromProduct } from "@/lib/catalog/unit-price";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const CITIES: { value: CityFilter; label: string }[] = [
  { value: null, label: "Todas as cidades" },
  { value: "sao-jose", label: "São José dos Campos" },
  // Adicione mais cidades conforme necessário
];

const SORT_OPTIONS = [
  { value: "price_asc", label: "Menor preço" },
  { value: "unit_price_asc", label: "Menor R$/un (kg/L/un)" },
  { value: "discount_desc", label: "Melhor desconto" },
  { value: "name_asc", label: "Nome A-Z" },
];

type Hit = ProductRow & { latest: LatestPrice[] };

function Resultados({ q, city, group, sort }: { q: string; city: CityFilter; group: boolean; sort: string }) {
  const [resultados, setResultados] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setResultados([]);
      setLoading(false);
      return;
    }

    let mounted = true;
    async function fetchResults() {
      setLoading(true);
      try {
        if (!isSupabaseConfigured()) {
          if (mounted) {
            setResultados([]);
            setLoading(false);
          }
          return;
        }

        // Verifica se usuário está logado para usar busca fresca vs cache
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (mounted) setUser(authUser);

        const data = authUser
          ? await searchProducts(supabase, q, 50, city)
          : await getCachedSearch(q.trim().slice(0, 80));

        if (mounted) {
          let results = data as Hit[];

          // Agrupar variações (mesmo nome base)
          if (group) {
            const groups = new Map<string, Hit[]>();
            for (const r of results) {
              const baseName = r.name.toLowerCase()
                .replace(/\b(marca|brand)\b/gi, "")
                .replace(/\d+[,.]?\d*\s*(g|kg|ml|l|un|pct|cx|pacote|caixa)\b/gi, "")
                .replace(/[^a-z0-9\s]/gi, "")
                .trim()
                .replace(/\s+/g, " ");
              const key = baseName || r.name.toLowerCase();
              const arr = groups.get(key) || [];
              arr.push(r);
              groups.set(key, arr);
            }
            // Pegar apenas o mais barato de cada grupo
            results = Array.from(groups.values()).map((groupItems) =>
              groupItems.reduce((a, b) => {
                const aPrice = Math.min(...a.latest.map((p) => p.promotional_price ?? p.price).filter(Boolean) as number[]);
                const bPrice = Math.min(...b.latest.map((p) => p.promotional_price ?? p.price).filter(Boolean) as number[]);
                return aPrice <= bPrice ? a : b;
              })
            );
          }

          // Ordenação
          switch (sort) {
            case "price_asc":
              results.sort((a, b) => {
                const aMin = Math.min(...a.latest.map((p) => p.promotional_price ?? p.price).filter(Boolean) as number[]);
                const bMin = Math.min(...b.latest.map((p) => p.promotional_price ?? p.price).filter(Boolean) as number[]);
                return aMin - bMin;
              });
              break;
            case "unit_price_asc":
              results.sort((a, b) => {
                const aUp = a.latest
                  .map((p) => {
                    const up = pricePerUnitFromProduct(p.promotional_price ?? p.price, a);
                    return up?.pricePerUnit ?? Infinity;
                  })
                  .filter((v) => v !== Infinity)[0] ?? Infinity;
                const bUp = b.latest
                  .map((p) => {
                    const up = pricePerUnitFromProduct(p.promotional_price ?? p.price, b);
                    return up?.pricePerUnit ?? Infinity;
                  })
                  .filter((v) => v !== Infinity)[0] ?? Infinity;
                return aUp - bUp;
              });
              break;
            case "discount_desc":
              results.sort((a, b) => {
                const aDiscount = calcDiscount(a.latest);
                const bDiscount = calcDiscount(b.latest);
                return bDiscount - aDiscount;
              });
              break;
            case "name_asc":
            default:
              results.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
          }

          setResultados(results);
          setLoading(false);
        }
      } catch (error) {
        if (mounted) {
          setResultados([]);
          setLoading(false);
        }
      }
    }

    fetchResults();
    return () => { mounted = false; };
  }, [q, city, group, sort]);

  function calcDiscount(latest: LatestPrice[]) {
    if (latest.length === 0) return 0;
    const prices = latest.map((p) => p.promotional_price ?? p.price);
    const min = Math.min(...prices);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    return avg > 0 ? ((avg - min) / avg) * 100 : 0;
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-hidden>
        <div className="shimmer-smooth h-24 w-full" />
        <div className="shimmer-smooth h-24 w-full" />
        <div className="shimmer-smooth h-24 w-full" />
      </div>
    );
  }

  if (!q.trim()) {
    return (
      <EmptyState
        icon={Search}
        title="Digite algo para buscar"
        description="Procure produtos por nome ou marca e compare o último preço por mercado."
      />
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <EmptyState
        icon={Search}
        title="Busca indisponível"
        description="Conecte o Supabase (.env.local, veja README) para buscar no catálogo."
      />
    );
  }

  if (resultados.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title={`Nada encontrado para “${q}”`}
        description="Tente outro termo. Novos produtos chegam via cadastro no /admin ou coleta automática."
      />
    );
  }

  if (group) {
    // View agrupada: accordion por grupo
    const groups = new Map<string, Hit[]>();
    for (const r of resultados) {
      const baseName = r.name.toLowerCase()
        .replace(/\b(marca|brand)\b/gi, "")
        .replace(/\d+[,.]?\d*\s*(g|kg|ml|l|un|pct|cx|pacote|caixa)\b/gi, "")
        .replace(/[^a-z0-9\s]/gi, "")
        .trim()
        .replace(/\s+/g, " ");
      const key = baseName || r.name.toLowerCase();
      const arr = groups.get(key) || [];
      arr.push(r);
      groups.set(key, arr);
    }

    return (
      <div className="space-y-3">
        {Array.from(groups.entries()).map(([groupName, items]) => {
          const bestItem = items.reduce((a, b) => {
            const aPrice = Math.min(...a.latest.map((p) => p.promotional_price ?? p.price).filter(Boolean) as number[]);
            const bPrice = Math.min(...b.latest.map((p) => p.promotional_price ?? p.price).filter(Boolean) as number[]);
            return aPrice <= bPrice ? a : b;
          });
          const discount = calcDiscount(bestItem.latest);

          return (
            <details key={groupName} className="group border rounded-xl overflow-hidden bg-card">
              <summary className="flex items-center justify-between gap-2 p-3 cursor-pointer list-none">
                <span className="flex items-center gap-2 font-medium">
                  <span className="truncate">{groupName}</span>
                  <Badge variant="outline" className="text-[10px]">{items.length} variações</Badge>
                  {discount >= 5 && (
                    <Badge variant="secondary" className="gap-1 text-[10px] text-offer">
                      <Search className="h-3 w-3" aria-hidden />
                      {Math.round(discount)}% abaixo da média
                    </Badge>
                  )}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-3 pb-3 pt-0 border-t">
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => (
                    <li key={item.id}>
                      <ProductCard product={item} latest={item.latest} variant="compact" />
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          );
        })}
      </div>
    );
  }

  // View normal: grid de cards
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {resultados.map((r) => (
        <li key={r.id}>
          <ProductCard
            product={r}
            latest={r.latest}
            variant="default"
          />
        </li>
      ))}
    </ul>
  );
}

export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string; group?: string; sort?: string }>;
}) {
  const { q = "", city, group, sort = "price_asc" } = await searchParams;
  const cityFilter = (city as CityFilter) ?? null;
  const groupEnabled = group === "true";
  const sortValue = sort;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl lg:text-4xl font-bold fade-in text-cta">
        {q ? `Resultados para “${q}”` : "Buscar produtos"}
      </h1>

      {/* Hero gradient background */}
      <div className="hero-banner-minimal" />

      {/* Header de filtros */}
      <Card className="card-glass card-hover-elevated">
        <CardContent className="pt-6 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Busca */}
            <div className="flex-1 sm:max-w-md">
              <Suspense fallback={<Skeleton className="shimmer-smooth h-12 w-full rounded-xl" />}><SearchAutocomplete /></Suspense>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Cidade */}
              <Select value={cityFilter ?? ""} onValueChange={(v) => {
                const params = new URLSearchParams();
                if (q) params.set("q", q);
                if (v) params.set("city", v);
                if (groupEnabled) params.set("group", "true");
                params.set("sort", sortValue);
                window.location.href = `/buscar?${params.toString()}`;
              }}>
                <SelectTrigger className="w-[180px] sm:w-[200px]">
                  <SelectValue placeholder="Cidade" />
                </SelectTrigger>
                <SelectContent>
                  {CITIES.map((c) => (
                    <SelectItem key={c.value ?? "all"} value={c.value ?? ""}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Agrupar variações */}
              <Button
                variant={groupEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams();
                  if (q) params.set("q", q);
                  if (cityFilter) params.set("city", cityFilter);
                  params.set("group", groupEnabled ? "false" : "true");
                  params.set("sort", sortValue);
                  window.location.href = `/buscar?${params.toString()}`;
                }}
                className="gap-1.5 btn-primary-custom border-none text-white"
              >
                <Layers className="h-4 w-4" />
                Agrupar variações
              </Button>

              {/* Ordenação */}
              <Select value={sortValue} onValueChange={(v) => {
                const params = new URLSearchParams();
                if (q) params.set("q", q);
                if (cityFilter) params.set("city", cityFilter);
                if (groupEnabled) params.set("group", "true");
                params.set("sort", v);
                window.location.href = `/buscar?${params.toString()}`;
              }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Suspense
        fallback={
          <div className="flex flex-col gap-3" aria-hidden>
            <div className="shimmer-smooth h-28 w-full rounded-xl" />
            <div className="shimmer-smooth h-28 w-full rounded-xl" />
            <div className="shimmer-smooth h-28 w-full rounded-xl" />
          </div>
        }
      >
        <Resultados q={q} city={cityFilter} group={groupEnabled} sort={sortValue} />
      </Suspense>
    </div>
  );
}