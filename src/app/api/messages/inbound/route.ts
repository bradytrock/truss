import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { inboundMessages, inboundSkipReason } from "@/lib/inbound-text";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

function webhookToken() {
  return process.env.MESSAGES_WEBHOOK_TOKEN?.trim() || "";
}

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const expected = webhookToken();
  if (expected) {
    const url = new URL(request.url);
    const header = request.headers.get("x-webhook-token")?.trim() || "";
    const query = url.searchParams.get("token")?.trim() || "";
    if (header !== expected && query !== expected) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  let raw: Record<string, unknown> = {};
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const skip = inboundSkipReason(raw);
  if (skip) {
    return NextResponse.json({ ok: true, skipped: true, reason: skip });
  }

  const messages = inboundMessages(raw);
  if (messages.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: "empty" });
  }

  const supabase = createClient<Database>(getSupabaseUrl(), getSupabaseKey());
  const saved: unknown[] = [];
  for (const fields of messages) {
    const { data, error } = await supabase.rpc("ingest_inbound_text", {
      p_from: fields.from,
      p_body: fields.content,
      p_handle: fields.handle,
      p_media_url: fields.mediaUrl,
      p_sent_at: fields.sentAt,
    });

    if (error) {
      if (
        error.code === "PGRST202" ||
        error.code === "PGRST204" ||
        error.code === "PGRST205" ||
        (error.message ?? "").includes("Could not find the")
      ) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          reason: "run_messages_sql",
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    saved.push(data ?? { ok: true });
  }

  return NextResponse.json(saved.length === 1 ? saved[0] : { ok: true, count: saved.length, messages: saved });
}
