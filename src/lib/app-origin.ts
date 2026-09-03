import { headers } from "next/headers";

function originFromEnv() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (vercel) {
    return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }
  return "";
}

function localHost(host: string) {
  return host.startsWith("localhost") || host.startsWith("127.") || host.startsWith("[::1]");
}

/**
 * Absolute origin for share links and link-preview images. Read from the request
 * so previews resolve on localhost, a preview deploy, and the live domain alike.
 */
export async function appOrigin() {
  try {
    const store = await headers();
    const host = store.get("x-forwarded-host") || store.get("host");
    if (host) {
      const forwarded = store.get("x-forwarded-proto")?.split(",")[0]?.trim();
      const proto = forwarded || (localHost(host) ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // headers() is only available while serving a request.
  }
  return originFromEnv() || "http://localhost:3847";
}
