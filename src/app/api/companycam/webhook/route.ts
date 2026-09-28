import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { companyCamSignatureMatches, parseCompanyCamWebhook } from "@/lib/companycam";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";
import { isMissingCompanyCam } from "@/lib/supabase/schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() || "";
  const raw = await request.text();
  const signature = request.headers.get("x-companycam-signature");
  if (!companyCamSignatureMatches(token, raw, signature)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let json: unknown = null;
  try {
    json = raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return NextResponse.json({ ok: true, skipped: true, reason: "invalid_json" });
  }

  const event = parseCompanyCamWebhook(json);
  if (!event.photo?.id || !event.photo.projectId) {
    return NextResponse.json({ ok: true, skipped: true, reason: event.eventType || "ignored" });
  }

  const supabase = createClient<Database>(getSupabaseUrl(), getSupabaseKey());
  const { data, error } = await supabase.rpc("companycam_ingest_photo", {
    p_token: token,
    p_project_id: event.photo.projectId,
    p_photo_id: event.photo.id,
    p_image_url: event.photo.url,
    p_caption: event.photo.caption,
    p_taken_on: event.photo.takenOn,
  });

  if (error) {
    if (isMissingCompanyCam(error)) {
      return NextResponse.json({ ok: true, skipped: true, reason: "run_companycam_sql" });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  if (row?.ok === false && (row.error === "invalid_token" || row.error === "missing_token")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return NextResponse.json(data ?? { ok: true });
}
