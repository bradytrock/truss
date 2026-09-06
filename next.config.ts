import type { NextConfig } from "next";

const TRUSS_SUPABASE_URL = "https://cxrgdjvkmvnuztubxldh.supabase.co";
const TRUSS_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Fs_dTxYT2nBFYVjLLG6vpg_n5b_NSa1";

const nextConfig: NextConfig = {
  // Cloud Agent / Cursor preview proxies rewrite the browser host away from localhost.
  // Use ** so multi-label hosts like p-3847-pod-….agent.cvm.dev are allowed.
  // "null" covers sandboxed preview iframes that send Origin: null (opaque origin).
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "null",
    "**.agent.cvm.dev",
    "**.cvm.dev",
    "*.agent.cvm.dev",
    "*.cvm.dev",
  ],
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
