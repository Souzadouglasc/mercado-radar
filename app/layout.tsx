import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteHeader } from "@/components/site-header";
import { BottomNav } from "@/components/bottom-nav";
import { SwRegister } from "@/components/sw-register";
import { Onboarding } from "@/components/onboarding";
import { PwaPrompt } from "@/components/pwa-prompt";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://mercado-radar.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "MercadoRadar — Compare preços de supermercados",
    template: "%s | MercadoRadar",
  },
  description:
    "Compare preços de produtos nos mercados Fort, Koch, Brasil e Komprão. Economize na sua compra.",
  applicationName: "MercadoRadar",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/icon-192.svg", type: "image/svg+xml" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "MercadoRadar" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "MercadoRadar",
    url: SITE_URL,
    title: "MercadoRadar — Compare preços de supermercados",
    description: "Compare preços de produtos nos mercados da região e economize.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "MercadoRadar — compare preços e economize",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MercadoRadar — Compare preços de supermercados",
    description: "Compare preços de produtos nos mercados da região e economize.",
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#178a4c" },
    { media: "(prefers-color-scheme: dark)", color: "#0c3b24" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-full">
        <ThemeProvider>
          <SiteHeader />
          <main className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-6 sm:px-6 md:pb-12 lg:px-10 lg:pt-8">
            {children}
          </main>
          <BottomNav />
          <SwRegister />
          <Onboarding />
          <PwaPrompt />
        </ThemeProvider>
      </body>
    </html>
  );
}
