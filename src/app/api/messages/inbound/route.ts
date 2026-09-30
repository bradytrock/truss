import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { authorizeInboundWebhook, parseInboundText } from "@/lib/photon-webhook";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { Database, Json } from "@/lib/supabase/database.types";
import { isMissingPhoton } from "@/lib/supabase/schema-errors";

export const runtime = "nodejs";

function asRecord(value: Json | null): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() || request.headers.get("x-webhook-token")?.trim() || "";
  const supabase = createClient<Database>(getSupabaseUrl(), getSupabaseKey());
  const { data, error } = await supabase.rpc("photon_webhook_account", { p_token: token });
  if (error) {
    if (isMissingPhoton(error)) {
      return NextResponse.json({ ok: true, skipped: true, reason: "run_photon_sql" });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const account = asRecord(data);
  const secret = typeof account?.webhookSecret === "string" ? account.webhookSecret : "";
  const fromNumber = typeof account?.fromNumber === "string" ? account.fromNumber : "";
  if (!secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const auth = authorizeInboundWebhook({
    secret,
    token: "",
    headerToken: "",
    queryToken: "",
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

  const parsed = parseInboundText(raw, fromNumber);
  if (parsed.skip) {
    return NextResponse.json({ ok: true, skipped: true, reason: parsed.reason });
  }

  const ingested = await supabase.rpc("ingest_inbound_text", {
    p_from: parsed.from,
    p_body: parsed.body,
    p_handle: parsed.handle,
    p_media_url: parsed.mediaUrl,
    p_sent_at: parsed.sentAt,
  });

  if (ingested.error) {
    if (
      ingested.error.code === "PGRST202" ||
      ingested.error.code === "PGRST204" ||
      ingested.error.code === "PGRST205" ||
      (ingested.error.message ?? "").includes("Could not find the")
    ) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "run_messages_sql",
      });
    }
    return NextResponse.json({ error: ingested.error.message }, { status: 500 });
  }

  return NextResponse.json(ingested.data ?? { ok: true });
}
