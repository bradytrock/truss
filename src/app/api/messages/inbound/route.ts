import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  authorizeInboundWebhook,
  inboundOurNumber,
  messagesWebhookToken,
  parseInboundText,
  spectrumWebhookSecret,
} from "@/lib/photon-webhook";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const url = new URL(request.url);
  const auth = authorizeInboundWebhook({
    secret: spectrumWebhookSecret(),
    token: messagesWebhookToken(),
    headerToken: request.headers.get("x-webhook-token") || "",
    queryToken: url.searchParams.get("token") || "",
    timestamp: request.headers.get("x-spectrum-timestamp") || "",
    signature: request.headers.get("x-spectrum-signature") || "",
    rawBody,
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let raw: unknown = {};
  try {
    raw = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const parsed = parseInboundText(raw, inboundOurNumber());
  if (parsed.skip) {
    return NextResponse.json({ ok: true, skipped: true, reason: parsed.reason });
  }

  const supabase = createClient<Database>(getSupabaseUrl(), getSupabaseKey());
  const { data, error } = await supabase.rpc("ingest_inbound_text", {
    p_from: parsed.from,
    p_body: parsed.body,
    p_handle: parsed.handle,
    p_media_url: parsed.mediaUrl,
    p_sent_at: parsed.sentAt,
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
