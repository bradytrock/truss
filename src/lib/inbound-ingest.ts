import { createClient } from "@supabase/supabase-js";
import { resolveAutomationReplies } from "@/lib/automations/replies";
import { inboundMessages, inboundSkipReason } from "@/lib/inbound-text";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";

function schemaMissing(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    (error.message ?? "").includes("Could not find the")
  );
}

export async function ingestCompanyMessages(raw: Record<string, unknown>, companyId: string) {
  const skip = inboundSkipReason(raw);
  if (skip) return { status: 200, body: { ok: true, skipped: true, reason: skip } };

  const messages = inboundMessages(raw);
  if (messages.length === 0) {
    return { status: 200, body: { ok: true, skipped: true, reason: "empty" } };
  }

  const supabase = createClient<Database>(getSupabaseUrl(), getSupabaseKey());
  const saved: unknown[] = [];
  for (const fields of messages) {
    if ((fields.action === "edit" || fields.action === "unsend") && fields.targetHandle) {
      const revised = await supabase.rpc("apply_imessage_revision", {
        p_company_id: companyId,
        p_handle: fields.targetHandle,
        p_body: fields.content,
        p_kind: fields.kind,
        p_detail: fields.detail,
      });
      if (revised.error) {
        if (schemaMissing(revised.error)) {
          return { status: 200, body: { ok: true, skipped: true, reason: "run_messages_sql" } };
        }
        return { status: 500, body: { error: revised.error.message } };
      }
      const revision = revised.data as { reason?: string } | null;
      if (revision?.reason !== "not_found") {
        saved.push(revised.data ?? { ok: true });
        continue;
      }
    }

    const { data, error } = await supabase.rpc("ingest_inbound_text", {
      p_from: fields.from,
      p_body: fields.content,
      p_handle: fields.handle,
      p_media_url: fields.mediaUrl,
      p_sent_at: fields.sentAt,
      p_company_id: companyId,
      p_kind: fields.kind,
      p_detail: fields.detail,
    });

    if (error) {
      if (schemaMissing(error)) {
        return { status: 200, body: { ok: true, skipped: true, reason: "run_messages_sql" } };
      }
      return { status: 500, body: { error: error.message } };
    }
    saved.push(data ?? { ok: true });
    await resolveAutomationReplies({
      companyId,
      from: fields.from,
      body: fields.content,
    }).catch((error: unknown) => {
      console.error("[automations] reply", error instanceof Error ? error.message : error);
    });
  }

  return {
    status: 200,
    body: saved.length === 1 ? (saved[0] ?? { ok: true }) : { ok: true, count: saved.length, messages: saved },
  };
}
