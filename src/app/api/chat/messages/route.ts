import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

function tokenFrom(request: Request, body?: Record<string, unknown>) {
  const url = new URL(request.url);
  const query = url.searchParams.get("token")?.trim() || "";
  const posted = typeof body?.token === "string" ? body.token.trim() : "";
  return posted || query;
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Chat is not available." }, { status: 503 });
  }
  const token = tokenFrom(request);
  if (!token) return NextResponse.json({ ok: false, error: "Missing chat." }, { status: 400 });
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("website_chat_read", { p_token: token });
  if (error) return NextResponse.json({ ok: false, error: "Chat is not ready yet." }, { status: 503 });
  return NextResponse.json(data ?? { ok: false });
}

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
  const token = tokenFrom(request, body);
  const text = typeof body.body === "string" ? body.body : "";
  if (!token) return NextResponse.json({ ok: false, error: "Missing chat." }, { status: 400 });
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("website_chat_post", { p_token: token, p_body: text });
  if (error) return NextResponse.json({ ok: false, error: "Chat is not ready yet." }, { status: 503 });
  const payload = (data ?? { ok: false }) as { ok?: boolean; error?: string };
  if (payload.ok === false) {
    return NextResponse.json(payload, { status: 400 });
  }
  return NextResponse.json(payload);
}
