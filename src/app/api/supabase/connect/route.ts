import { NextResponse } from "next/server";
import { SB_KEY_COOKIE, SB_KEY_COOKIE_LEGACY, SB_URL_COOKIE, SB_URL_COOKIE_LEGACY, normalizeSupabaseUrl } from "@/lib/supabase/env";
import { writeFile } from "fs/promises";
import path from "path";

const cookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 365,
};

export async function POST(request: Request) {
  const body = (await request.json()) as { url?: string; key?: string };
  const url = normalizeSupabaseUrl(body.url ?? "");
  const key = body.key?.trim() ?? "";

  if (!url.startsWith("https://") || !url.includes("supabase.co")) {
    return NextResponse.json(
      { error: "Use the project URL from Settings → API, like https://xxxx.supabase.co." },
      { status: 400 }
    );
  }
  if (key.length < 20) {
    return NextResponse.json(
      { error: "Paste the publishable or anon key from Settings → API." },
      { status: 400 }
    );
  }

  const health = await fetch(`${url}/auth/v1/health`, {
    headers: { apikey: key },
    cache: "no-store",
  }).catch(() => null);
  const rest = health?.ok
    ? health
    : await fetch(`${url}/rest/v1/`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      }).catch(() => null);
  if (!rest || (rest.status !== 200 && rest.status !== 401 && rest.status !== 404)) {
    return NextResponse.json(
      {
        error:
          "Could not reach that project. Check the URL, confirm the project is not paused, and use the publishable/anon key.",
      },
      { status: 400 }
    );
  }
  if (rest.status === 401) {
    return NextResponse.json(
      { error: "The key was rejected. Copy the publishable or anon key from Settings → API." },
      { status: 400 }
    );
  }

  if (process.env.NODE_ENV !== "production") {
    const envPath = path.join(process.cwd(), ".env.local");
    const contents = `NEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}\n`;
    await writeFile(envPath, contents, "utf8");
  }

  const response = NextResponse.json({ ok: true, url });
  response.cookies.set(SB_URL_COOKIE, url, cookieOptions);
  response.cookies.set(SB_KEY_COOKIE, key, cookieOptions);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SB_URL_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  response.cookies.set(SB_KEY_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  response.cookies.set(SB_URL_COOKIE_LEGACY, "", { ...cookieOptions, maxAge: 0 });
  response.cookies.set(SB_KEY_COOKIE_LEGACY, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
