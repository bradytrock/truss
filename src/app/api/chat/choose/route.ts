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
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const channel = typeof body.channel === "string" ? body.channel.trim() : "";
  if (!token) return NextResponse.json({ ok: false, error: "Missing chat." }, { status: 400 });

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("website_chat_choose", {
    p_token: token,
    p_channel: channel,
  });
  if (error) return NextResponse.json({ ok: false, error: "Chat is not ready yet." }, { status: 503 });
  const payload = (data ?? { ok: false }) as { ok?: boolean; error?: string };
  if (payload.ok === false) return NextResponse.json(payload, { status: 400 });
  return NextResponse.json(payload);
}
