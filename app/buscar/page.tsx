import type { Metadata } from "next";
import BuscarClient from "./client";

export const metadata: Metadata = {
  title: "Buscar produtos",
  description: "Encontre produtos e compare preços nos mercados de São José, Santa Catarina.",
};

export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string; group?: string; sort?: string }>;
}) {
  const { q = "", city, group, sort = "price_asc" } = await searchParams;
  return <BuscarClient q={q} city={city} group={group === "true"} sort={sort} />;
}
