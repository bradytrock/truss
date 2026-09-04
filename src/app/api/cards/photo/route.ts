import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/app-origin";
import { LOGO_MAX_BYTES } from "@/lib/company-logo";
import { getSupabaseUrl } from "@/lib/supabase/env";
import {
  isAllowedObjectKey,
  storageKindFromObjectKey,
} from "@/lib/storage/b2";
import { objectKeyFromStoredUrl } from "@/lib/storage/urls";

export const runtime = "nodejs";

async function resolvePhotoFetchUrl(raw: string, requestUrl: string): Promise<URL | null> {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Relative app proxy: /api/storage/object?path=…
  if (trimmed.startsWith("/")) {
    try {
      const absolute = new URL(trimmed, requestUrl);
      const key = objectKeyFromStoredUrl(absolute.toString());
      if (!key || !isAllowedObjectKey(key)) return null;
      if (storageKindFromObjectKey(key) !== "company-assets") return null;
      return absolute;
    } catch {
      return null;
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  const host = parsed.host.toLowerCase();
  const supabaseHost = (() => {
    try {
      return new URL(getSupabaseUrl()).host.toLowerCase();
    } catch {
      return "";
    }
  })();

  // Legacy Supabase public storage.
  if (supabaseHost && host === supabaseHost) return parsed;
  if (host.endsWith(".supabase.co") && parsed.pathname.includes("/storage/v1/object/public/")) {
    return parsed;
  }

  // Same-origin (or configured app origin) storage proxy with company-assets only.
  const originHost = (() => {
    try {
      return new URL(requestUrl).host.toLowerCase();
    } catch {
      return "";
    }
  })();
  let configuredHost = "";
  try {
    configuredHost = new URL(await appOrigin()).host.toLowerCase();
  } catch {
    configuredHost = "";
  }
  const isAppHost =
    Boolean(originHost && host === originHost) ||
    Boolean(configuredHost && host === configuredHost) ||
    host === "127.0.0.1" ||
    host === "localhost" ||
    host.startsWith("localhost:");

  if (
    isAppHost &&
    (parsed.pathname === "/api/storage/object" || parsed.pathname.endsWith("/api/storage/object"))
  ) {
    const key = objectKeyFromStoredUrl(parsed.toString());
    if (!key || !isAllowedObjectKey(key)) return null;
    if (storageKindFromObjectKey(key) !== "company-assets") return null;
    return parsed;
  }

  return null;
}

/** Same-origin fetch of a seat photo so Save contact can embed it in the .vcf. */
export async function GET(request: Request) {
  const src = new URL(request.url).searchParams.get("src")?.trim() ?? "";
  const allowed = await resolvePhotoFetchUrl(src, request.url);
  if (!allowed) {
    return NextResponse.json({ error: "Bad photo URL." }, { status: 400 });
  }

  try {
    const upstream = await fetch(allowed, {
      headers: { Accept: "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: "Photo unavailable." }, { status: 502 });
    }
    const type = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/")) {
      return NextResponse.json({ error: "Not an image." }, { status: 415 });
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength <= 0 || buffer.byteLength > LOGO_MAX_BYTES) {
      return NextResponse.json({ error: "Photo too large." }, { status: 413 });
    }
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[cards] photo proxy", error);
    return NextResponse.json({ error: "Photo unavailable." }, { status: 502 });
  }
}
