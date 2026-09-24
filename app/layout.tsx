import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteHeader } from "@/components/site-header";
import { BottomNav } from "@/components/bottom-nav";
import { SwRegister } from "@/components/sw-register";

export const metadata: Metadata = {
  title: {
    default: "MercadoRadar — Compare preços de supermercados",
    template: "%s | MercadoRadar",
  },
  description:
    "Compare preços de produtos nos mercados Fort, Koch, Brasil e Komprão. Economize na sua compra.",
  applicationName: "MercadoRadar",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "MercadoRadar" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "MercadoRadar",
    title: "MercadoRadar — Compare preços de supermercados",
    description: "Compare preços de produtos nos mercados da região e economize.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#15803d" },
    { media: "(prefers-color-scheme: dark)", color: "#052e16" },
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
          <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-24 pt-6 md:pb-12">
            {children}
          </main>
          <BottomNav />
          <SwRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
