import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PackageSearch, ArrowUpDown, Filter, ChevronDown, Tag, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Price } from "@/components/price";
import { ProductCard } from "@/components/product-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getCategoryById,
  getProductsByCategory,
  type CategoryComparisonRow,
  type CityFilter,
} from "@/lib/catalog/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const CITIES: { value: CityFilter; label: string }[] = [
  { value: null, label: "Todas as cidades" },
  { value: "sao-jose", label: "São José dos Campos" },
  // Adicione mais cidades conforme necessário
];

const SORT_OPTIONS = [
  { value: "unit_price_asc", label: "Menor R$/un (kg/L/un)" },
  { value: "price_asc", label: "Menor preço" },
  { value: "name_asc", label: "Nome A-Z" },
];

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ city?: string; sort?: string }>;
};

export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  
  if (!isSupabaseConfigured()) {
    return {
      title: "Categoria",
      description: "Compare preços por categoria",
    };
  }
  
  const supabase = await createClient();
  const category = await getCategoryById(supabase, id);
  
  if (!category) {
    return {
      title: "Categoria não encontrada",
    };
  }

  return {
    title: `Comparar: ${category.name}`,
    description: `Compare preços por unidade (R$/kg, R$/L, R$/un) em ${category.name} nos mercados da região.`,
    openGraph: {
      title: `MercadoRadar — ${category.name}`,
      description: `Compare preços de ${category.name} nos mercados Fort, Koch, Brasil e Komprão.`,
      type: "website",
      locale: "pt_BR",
    },
  };
}

function ProductGridSkeleton() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i}>
          <Card className="p-4 card-elevated">
            <div className="shimmer-fancy h-14 w-14 rounded-xl mb-3" />
            <div className="shimmer-fancy h-4 w-3/4 mb-2" />
            <div className="shimmer-fancy h-3 w-1/2 mb-4" />
            <div className="space-y-2">
              <div className="shimmer-fancy h-3 w-full" />
              <div className="shimmer-fancy h-3 w-2/3" />
              <div className="shimmer-fancy h-3 w-1/2" />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function ProductGrid({
  products,
  sort,
}: {
  products: CategoryComparisonRow[];
  sort: string;
}) {
  // Apply sorting
  let sorted = [...products];
  
  switch (sort) {
    case "price_asc":
      sorted.sort((a, b) => {
        const aMin = a.latest.length > 0 
          ? Math.min(...a.latest.map((p) => p.promotional_price ?? p.price).filter(Boolean) as number[])
          : Infinity;
        const bMin = b.latest.length > 0 
          ? Math.min(...b.latest.map((p) => p.promotional_price ?? p.price).filter(Boolean) as number[])
          : Infinity;
        return aMin - bMin;
      });
      break;
    case "name_asc":
      sorted.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      break;
    case "unit_price_asc":
    default:
      // Already sorted by unit price in the query
      break;
  }

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={PackageSearch}
        title="Nenhum produto nesta categoria"
        description="Ainda não há produtos cadastrados nesta categoria. Novos produtos chegam via cadastro no /admin ou coleta automática."
      />
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((product) => (
        <li key={product.id}>
          <ProductCard 
            product={product} 
            latest={product.latest} 
            variant="default" 
          />
        </li>
      ))}
    </ul>
  );
}

async function CategoryContent({ 
  params, 
  searchParams 
}: Props) {
  const { id } = await params;
  const { city, sort = "unit_price_asc" } = await searchParams;
  const cityFilter = (city as CityFilter) ?? null;
  const sortValue = sort;

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">Categoria</h1>
          <p className="text-muted-foreground">Compare preços por unidade</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={PackageSearch}
              title="Catálogo indisponível"
              description="Conecte o Supabase (.env.local, veja README) para ver preços reais."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  
  const [category, products] = await Promise.all([
    getCategoryById(supabase, id),
    getProductsByCategory(supabase, id, 50, cityFilter),
  ]);

  if (!category) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Hero com nome da categoria + ícone */}
      <Card className="overflow-hidden hero-card">
        <CardContent className="pt-6 pb-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-4">
              {category.image_url && (
                <div className="h-16 w-16 lg:h-20 lg:w-20 shrink-0 rounded-xl overflow-hidden bg-muted border border-border/50">
                  <img
                    src={category.image_url}
                    alt={category.name}
                    className="h-full w-full object-cover fade-in"
                  />
                </div>
              )}
              <div className="fade-in-slow">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Tag className="h-4 w-4 text-primary" aria-hidden />
                  <span>Categoria</span>
                </div>
                <h1 className="text-2xl lg:text-3xl font-bold leading-tight">{category.name}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {products.length} produto{products.length !== 1 ? "s" : ""} encontrado{products.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hero gradient background */}
      <div className="hero-gradient-inset" />

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {/* Cidade */}
              <Select value={cityFilter ?? ""} onValueChange={(v) => {
                const params = new URLSearchParams();
                if (v) params.set("city", v);
                params.set("sort", sortValue);
                window.location.href = `/categorias/${id}?${params.toString()}`;
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

              {/* Ordenação */}
              <Select value={sortValue} onValueChange={(v) => {
                const params = new URLSearchParams();
                if (cityFilter) params.set("city", cityFilter);
                params.set("sort", v);
                window.location.href = `/categorias/${id}?${params.toString()}`;
              }}>
                <SelectTrigger className="w-[220px]">
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

      {/* Grid de produtos */}
      <Suspense fallback={<ProductGridSkeleton />}>
        <ProductGrid products={products} sort={sortValue} />
      </Suspense>
    </div>
  );
}

export default async function CategoriaPage({ params, searchParams }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <CategoryContent params={params} searchParams={searchParams} />
    </div>
  );
}