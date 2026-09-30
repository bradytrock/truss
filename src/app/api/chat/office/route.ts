import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in." }, { status: 401 });
  const { data, error } = await supabase.rpc("website_chat_office_list");
  if (error) return NextResponse.json({ ok: true, chats: [], missing: true });
  return NextResponse.json(data ?? { ok: true, chats: [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in." }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const chatId = typeof body.chatId === "string" ? body.chatId : "";
  const text = typeof body.body === "string" ? body.body : "";
  if (!chatId) return NextResponse.json({ ok: false, error: "Missing chat." }, { status: 400 });

  const { data, error } = await supabase.rpc("website_chat_office_reply", {
    p_chat_id: chatId,
    p_body: text,
  });
  if (error) return NextResponse.json({ ok: false, error: "Could not send that reply." }, { status: 503 });
  const payload = (data ?? { ok: false }) as { ok?: boolean; error?: string };
  if (payload.ok === false) return NextResponse.json(payload, { status: 400 });
  return NextResponse.json(payload);
}
