import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { parseMycrmsimWebhook } from "@/lib/mycrmsim";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

function webhookToken(request: Request) {
  const url = new URL(request.url);
  return (
    request.headers.get("x-webhook-token")?.trim() ||
    url.searchParams.get("token")?.trim() ||
    ""
  );
}

export async function GET() {
  return NextResponse.json({ ok: true, provider: "mycrmsim" });
}

export async function POST(request: Request) {
  let raw: unknown = {};
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: true, skipped: true, reason: "unreadable" });
  }

  const event = parseMycrmsimWebhook(raw);
  if (event.kind === "ignore") {
    return NextResponse.json({ ok: true, skipped: true, reason: "ignored" });
  }

  const token = webhookToken(request);
  const supabase = createClient<Database>(getSupabaseUrl(), getSupabaseKey());
  const shared = {
    p_location_id: event.locationId,
    p_token: token,
    p_phone: "phone" in event ? event.phone : "",
  };

  const args =
    event.kind === "status"
      ? {
          ...shared,
          p_kind: "status",
          p_message_id: event.messageId,
          p_status: event.status,
        }
      : event.kind === "call"
        ? {
            ...shared,
            p_kind: "call",
            p_body: event.message,
            p_is_me: event.isMe,
          }
        : {
            ...shared,
            p_kind: "message",
            p_body: event.message,
            p_message_id: event.messageId,
            p_is_me: event.isMe,
            p_media_url: event.mediaUrl,
          };

  const { data, error } = await supabase.rpc("ingest_mycrmsim_event", args);

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
        reason: "run_mycrmsim_sql",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const payload = data && typeof data === "object" ? (data as { ok?: boolean; error?: string }) : null;
  if (payload?.ok === false) {
    return NextResponse.json(payload, { status: payload.error === "Unauthorized." ? 401 : 400 });
  }

  return NextResponse.json(data ?? { ok: true });
}
