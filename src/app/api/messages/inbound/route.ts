import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { parseTextWebhookPayload } from "@/lib/mycrmsim";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

function webhookToken() {
  return process.env.MESSAGES_WEBHOOK_TOKEN?.trim() || "";
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization")?.trim() || "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return "";
}

function webhookAuthorized(request: Request) {
  const expected = webhookToken();
  if (!expected) return true;
  const url = new URL(request.url);
  const header = request.headers.get("x-webhook-token")?.trim() || "";
  const query = url.searchParams.get("token")?.trim() || "";
  const bearer = bearerToken(request);
  return header === expected || query === expected || bearer === expected;
}

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  if (!webhookAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let raw: Record<string, unknown> = {};
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const event = parseTextWebhookPayload(raw);
  if (event.kind !== "inbound") {
    return NextResponse.json({ ok: true, skipped: true, reason: event.kind === "skip" ? event.reason : event.kind });
  }

  const supabase = createClient<Database>(getSupabaseUrl(), getSupabaseKey());
  const { data, error } = await supabase.rpc("ingest_inbound_text", {
    p_from: event.from,
    p_body: event.body,
    p_handle: event.handle,
    p_media_url: event.mediaUrl,
    p_sent_at: event.sentAt,
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
