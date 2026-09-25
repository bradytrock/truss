import { leadAssignNeedsEmail } from "@/lib/lead-assign-email";
import { sendVoiceLeadAssignEmails } from "@/lib/lead-assign-email-server";
import { looksLikePhone } from "@/lib/phone";
import { sendText } from "@/lib/text-provider";
import { createAnonClient } from "@/lib/supabase/anon";

export type VoiceRpcResult = {
  ok?: boolean;
  error?: string;
  action?: "attach" | "create";
  matchKind?: string;
  jobId?: string | null;
  opportunityId?: string | null;
  contactId?: string | null;
  jobCode?: string;
  ownerStaffId?: string;
  ownerName?: string;
  originatorStaffId?: string;
  originatorName?: string;
  notifyStaffId?: string;
  notifyName?: string;
  notifyPhone?: string;
  notifySms?: string;
  author?: string;
  said?: string;
  found?: boolean;
  kind?: string;
  contactName?: string;
  calledStaffName?: string;
  eventId?: string;
  title?: string;
  startsAt?: string;
  endsAt?: string;
  assignee?: string;
  staffNotified?: boolean;
};

function asResult(data: unknown): VoiceRpcResult {
  if (!data || typeof data !== "object") return { ok: false, error: "No response from the desk." };
  return data as VoiceRpcResult;
}

export function readVoiceToken(request: Request) {
  const header = request.headers.get("authorization")?.trim() ?? "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  const named = request.headers.get("x-voice-token")?.trim() ?? "";
  if (named) return named;
  return new URL(request.url).searchParams.get("token")?.trim() ?? "";
}

export async function voiceLookup(token: string, phone: string, email = "") {
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("voice_agent_lookup", {
    p_token: token,
    p_phone: phone,
    p_email: email,
  });
  if (error) return { ok: false, error: error.message } satisfies VoiceRpcResult;
  return asResult(data);
}

export async function voiceIntake(
  token: string,
  input: {
    phone: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    notes?: string;
    transcript?: string;
    durationSeconds?: number | null;
  },
) {
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("voice_agent_intake", {
    p_token: token,
    p_phone: input.phone,
    p_first_name: input.firstName ?? "",
    p_last_name: input.lastName ?? "",
    p_email: input.email ?? "",
    p_street: input.street ?? "",
    p_city: input.city ?? "",
    p_state: input.state || "TX",
    p_postal_code: input.postalCode ?? "",
    p_notes: input.notes ?? "",
    p_transcript: input.transcript ?? "",
    p_duration_seconds: input.durationSeconds ?? null,
  });
  if (error) return { ok: false, error: error.message } satisfies VoiceRpcResult;
  const result = asResult(data);
  if (!result.ok) return result;
  if (result.action === "create" && result.opportunityId && leadAssignNeedsEmail(result)) {
    try {
      await sendVoiceLeadAssignEmails(supabase, {
        token,
        opportunityId: result.opportunityId,
      });
    } catch {
      // SMS notify still runs even if the assignment email fails.
    }
  }
  const notify = await notifyOwningPm(token, result);
  return { ...result, staffNotified: notify.notified };
}

export async function voiceBook(
  token: string,
  input: {
    title: string;
    startsAt: string;
    endsAt?: string;
    jobId?: string;
    opportunityId?: string;
    kind?: string;
    notes?: string;
    location?: string;
  },
) {
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("voice_agent_book", {
    p_token: token,
    p_title: input.title,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt || null,
    p_job_id: input.jobId || null,
    p_opportunity_id: input.opportunityId || null,
    p_kind: input.kind || "site_walk",
    p_notes: input.notes ?? "",
    p_location: input.location ?? "",
  });
  if (error) return { ok: false, error: error.message } satisfies VoiceRpcResult;
  return asResult(data);
}

export async function voiceLog(
  token: string,
  input: { body: string; jobId?: string; opportunityId?: string; type?: string },
) {
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("voice_agent_log", {
    p_token: token,
    p_body: input.body,
    p_job_id: input.jobId || null,
    p_opportunity_id: input.opportunityId || null,
    p_type: input.type || "call",
  });
  if (error) return { ok: false, error: error.message } satisfies VoiceRpcResult;
  return asResult(data);
}

/** Staff only. Never pass a homeowner number here. */
async function notifyOwningPm(token: string, result: VoiceRpcResult) {
  const to = result.notifyPhone?.trim() ?? "";
  const content = result.notifySms?.trim() ?? "";
  if (!looksLikePhone(to) || !content) return { notified: false };
  try {
    const sent = await sendText({ to, content });
    if (sent.ok && (result.jobId || result.opportunityId)) {
      await voiceLog(token, {
        body: `Texted ${result.notifyName || "the project manager"}: ${content}`,
        jobId: result.jobId ?? undefined,
        opportunityId: result.opportunityId ?? undefined,
        type: "text",
      });
    }
    return { notified: sent.ok };
  } catch {
    return { notified: false };
  }
}
