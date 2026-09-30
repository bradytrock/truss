import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Chat is not available." }, { status: 503 });
  }
  const slug = new URL(request.url).searchParams.get("company")?.trim().toLowerCase() || "";
  if (!slug) return NextResponse.json({ ok: false, error: "Missing office." }, { status: 400 });

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("website_chat_lookup", { p_slug: slug });
  if (error) {
    return NextResponse.json({ ok: false, error: "Chat is not ready yet." }, { status: 503 });
  }
  const payload = (data ?? { ok: false }) as { ok?: boolean };
  if (payload.ok === false) return NextResponse.json(payload, { status: 404 });
  return NextResponse.json(payload);
}
