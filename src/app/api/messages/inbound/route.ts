import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { digitsOnly } from "@/lib/phone";
import { sendblueFromNumber } from "@/lib/sendblue";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

function webhookToken() {
  return process.env.MESSAGES_WEBHOOK_TOKEN?.trim() || "";
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function last10(value: string) {
  return digitsOnly(value).slice(-10);
}

function flatten(body: Record<string, unknown>) {
  const nested = body.message;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...body, ...(nested as Record<string, unknown>) };
  }
  return body;
}

function isOutboundPayload(body: Record<string, unknown>) {
  if (body.is_outbound === true) return true;
  const from = asString(body.from_number) || asString(body.number);
  const ours = sendblueFromNumber();
  const fromKey = last10(from);
  const oursKey = last10(ours);
  return Boolean(oursKey && fromKey && fromKey === oursKey);
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

  const body = flatten(raw);
  if (isOutboundPayload(body)) {
    return NextResponse.json({ ok: true, skipped: true, reason: "outbound" });
  }

  const from = asString(body.from_number) || asString(body.number);
  const content = asString(body.content);
  const handle = asString(body.message_handle);
  const mediaUrl = asString(body.media_url);
  const sentAt = asString(body.date_sent) || null;

  const supabase = createClient<Database>(getSupabaseUrl(), getSupabaseKey());
  const { data, error } = await supabase.rpc("ingest_inbound_text", {
    p_from: from,
    p_body: content,
    p_handle: handle,
    p_media_url: mediaUrl,
    p_sent_at: sentAt,
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

  return NextResponse.json(data ?? { ok: true });
}
