import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { companyCamSignatureMatches, parseCompanyCamWebhook } from "@/lib/companycam";
import { attachCompanyCamWebhookProject } from "@/lib/companycam-server";
import { railwayClientOptions } from "@/lib/railway-rest";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";
import { isMissingCompanyCam } from "@/lib/supabase/schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  if (!event.photo?.id) {
    return NextResponse.json({ ok: true, skipped: true, reason: event.eventType || "ignored" });
  }

  const supabase = createClient<Database>(getSupabaseUrl(), getSupabaseKey(), railwayClientOptions());
  if (event.eventType === "photo.deleted") {
    const removed = await supabase.rpc("companycam_remove_photo", {
      p_token: token,
      p_project_id: event.photo.projectId,
      p_photo_id: event.photo.id,
    });
    if (removed.error) {
      if (isMissingCompanyCam(removed.error) || removed.error.message.toLowerCase().includes("companycam_remove_photo")) {
        return NextResponse.json({ ok: true, skipped: true, reason: "remove_unavailable" });
      }
      return NextResponse.json({ error: removed.error.message }, { status: 500 });
    }
    const removedRow = removed.data && typeof removed.data === "object" ? (removed.data as Record<string, unknown>) : null;
    if (removedRow?.ok === false && (removedRow.error === "invalid_token" || removedRow.error === "missing_token")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return NextResponse.json(removed.data ?? { ok: true });
  }

  if (!event.photo.projectId) {
    return NextResponse.json({ ok: true, skipped: true, reason: event.eventType || "ignored" });
  }

  const ingested = await ingestCompanyCamWebhookPhoto(supabase, token, event.photo);
  if (ingested.response) return ingested.response;
  if (ingested.reason !== "project_not_linked") return NextResponse.json(ingested.data ?? { ok: true });

  try {
    const attached = await attachCompanyCamWebhookProject(supabase, {
      webhookToken: token,
      projectId: event.photo.projectId,
    });
    if (attached.linked) {
      const again = await ingestCompanyCamWebhookPhoto(supabase, token, event.photo);
      if (again.response) return again.response;
      return NextResponse.json(again.data ?? { ok: true });
    }
  } catch {
    // The photo stays unlinked until the job is opened or CompanyCam sends it again.
  }
  return NextResponse.json(ingested.data ?? { ok: true, skipped: true, reason: "project_not_linked" });
}

async function ingestCompanyCamWebhookPhoto(
  supabase: ReturnType<typeof createClient<Database>>,
  token: string,
  photo: { id: string; projectId: string; url: string; caption: string; takenOn: string },
) {
  const { data, error } = await supabase.rpc("companycam_ingest_photo", {
    p_token: token,
    p_project_id: photo.projectId,
    p_photo_id: photo.id,
    p_image_url: photo.url,
    p_caption: photo.caption,
    p_taken_on: photo.takenOn,
  });
  if (error) {
    if (isMissingCompanyCam(error)) {
      return { response: NextResponse.json({ ok: true, skipped: true, reason: "run_companycam_sql" }) };
    }
    return { response: NextResponse.json({ error: error.message }, { status: 500 }) };
  }
  const row = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  if (row?.ok === false && (row.error === "invalid_token" || row.error === "missing_token")) {
    return { response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  return {
    response: null,
    data,
    reason: row?.skipped === true && row.reason === "project_not_linked" ? "project_not_linked" : "",
  };
}
