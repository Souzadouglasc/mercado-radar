import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ofertas do dia",
  description: "Veja as melhores ofertas e quedas de preço nos mercados de São José dos Campos.",
};

import OfertasPageClient from "./page.client";

export default function OfertasPage() {
  return <OfertasPageClient />;
}