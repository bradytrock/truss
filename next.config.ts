import type { NextConfig } from "next";

const TRUSS_SUPABASE_URL = "https://cxrgdjvkmvnuztubxldh.supabase.co";
const TRUSS_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Fs_dTxYT2nBFYVjLLG6vpg_n5b_NSa1";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: {
    proxyClientMaxBodySize: "15mb",
  },
  async headers() {
    return [
      {
        source: "/share/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
      {
        source: "/:company/card/:person",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
      {
        source: "/api/share/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || TRUSS_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      TRUSS_SUPABASE_PUBLISHABLE_KEY,
  },
};

export default nextConfig;
