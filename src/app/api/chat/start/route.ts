import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Chat is not available." }, { status: 503 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const slug = typeof body.company === "string" ? body.company.trim().toLowerCase() : "";
  if (!slug) return NextResponse.json({ ok: false, error: "Missing office." }, { status: 400 });

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("website_chat_start", { p_slug: slug });
  if (error) {
    return NextResponse.json({ ok: false, error: "Chat is not ready yet." }, { status: 503 });
  }
  return NextResponse.json(data ?? { ok: false });
}
