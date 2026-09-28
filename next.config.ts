import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "edge.osuper.com.br" },
      { protocol: "https", hostname: "bistek.vteximg.com.br" },
      { protocol: "https", hostname: "superangeloni.vteximg.com.br" },
      { protocol: "https", hostname: "brasilatacadista.com.br" },
      { protocol: "https", hostname: "komprao.com.br" },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
    ],
  },
};

export default nextConfig;

