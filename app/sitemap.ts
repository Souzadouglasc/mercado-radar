import type { MetadataRoute } from "next";

const MARKET_SLUGS = ["fort", "koch", "brasil", "komprao"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mercado-radar.vercel.app";
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/buscar`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    ...MARKET_SLUGS.map((slug) => ({
      url: `${base}/mercados/${slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}
