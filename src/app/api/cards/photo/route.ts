import { NextResponse } from "next/server";
import { LOGO_MAX_BYTES } from "@/lib/company-logo";
import { getSupabaseUrl } from "@/lib/supabase/env";

export const runtime = "nodejs";

function allowedPhotoUrl(raw: string) {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const supabaseHost = (() => {
    try {
      return new URL(getSupabaseUrl()).host.toLowerCase();
    } catch {
      return "";
    }
  })();
  const host = parsed.host.toLowerCase();
  // Seat photos live in the company-assets public bucket. Local data URLs never hit this route.
  if (supabaseHost && host === supabaseHost) return parsed;
  if (host.endsWith(".supabase.co") && parsed.pathname.includes("/storage/v1/object/public/")) {
    return parsed;
  }
  return null;
}

/** Same-origin fetch of a public seat photo so Save contact can embed it in the .vcf. */
export async function GET(request: Request) {
  const src = new URL(request.url).searchParams.get("src")?.trim() ?? "";
  const allowed = allowedPhotoUrl(src);
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
