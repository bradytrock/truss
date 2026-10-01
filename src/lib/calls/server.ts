import { randomUUID } from "crypto";
import {
  callRoomName,
  cellLegIdentity,
  deleteRoom,
  dialSipParticipant,
  liveKitConfigured,
  mintSoftphoneToken,
  pstnIdentity,
  removeParticipant,
  softphoneIdentity,
  transferSipParticipant,
} from "@/lib/calls/livekit";
import type { CallRingTarget } from "@/lib/calls/types";
import { toE164 } from "@/lib/phone";
import { createAnonClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asTargets(value: unknown): CallRingTarget[] {
  if (!Array.isArray(value)) return [];
  const targets: CallRingTarget[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (!row) continue;
    const staffId = typeof row.staffId === "string" ? row.staffId : "";
    const kind = row.kind;
    if (!staffId || (kind !== "softphone" && kind !== "cell" && kind !== "app")) continue;
    targets.push({
      staffId,
      staffName: typeof row.staffName === "string" ? row.staffName : undefined,
      kind,
      phone: typeof row.phone === "string" ? row.phone : "",
      ringTimeoutSeconds:
        typeof row.ringTimeoutSeconds === "number" ? row.ringTimeoutSeconds : 25,
    });
  }
  return targets;
}

export async function requireCallingUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in." as const };
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role, staff_id, full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.company_id || !profile.staff_id) {
    return { error: "No company seat on this login." as const };
  }
  return {
    supabase,
    companyId: profile.company_id as string,
    staffId: profile.staff_id as string,
    role: (profile.role as string) || "project_manager",
    fullName: (profile.full_name as string) || "",
  };
}

export async function loadCallingSettings(companyId: string) {
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("calling_settings_for_company", {
    p_company: companyId,
  });
  if (error) return { ok: false as const, error: error.message };
  const row = asRecord(data) ?? {};
  return {
    ok: true as const,
    configured: Boolean(row.configured),
    enabled: Boolean(row.enabled),
    officeLine: typeof row.officeLine === "string" ? row.officeLine : "",
    livekitOutboundTrunkId:
      typeof row.livekitOutboundTrunkId === "string" ? row.livekitOutboundTrunkId : "",
    livekitInboundTrunkId:
      typeof row.livekitInboundTrunkId === "string" ? row.livekitInboundTrunkId : "",
    livekitDispatchRuleId:
      typeof row.livekitDispatchRuleId === "string" ? row.livekitDispatchRuleId : "",
    webhookToken: typeof row.webhookToken === "string" ? row.webhookToken : "",
  };
}

async function ringTargets(
  companyId: string,
  queueId: string | null,
  staffId: string | null,
): Promise<CallRingTarget[]> {
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("calling_ring_targets", {
    p_company: companyId,
    p_queue_id: queueId,
    p_staff_id: staffId,
  });
  if (error) throw new Error(error.message);
  const row = asRecord(data);
  return asTargets(row?.targets);
}

async function startSession(input: {
  companyId: string;
  direction: "inbound" | "outbound";
  roomName: string;
  fromNumber: string;
  toNumber: string;
  queueId?: string | null;
  callerParticipantIdentity?: string;
  livekitSipCallId?: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("calling_start_session", {
    p_company: input.companyId,
    p_direction: input.direction,
    p_room_name: input.roomName,
    p_from_number: input.fromNumber,
    p_to_number: input.toNumber,
    p_queue_id: input.queueId ?? null,
    p_caller_participant_identity: input.callerParticipantIdentity ?? "",
    p_livekit_sip_call_id: input.livekitSipCallId ?? "",
    p_metadata: (input.metadata ?? {}) as Json,
  });
  if (error) throw new Error(error.message);
  const row = asRecord(data);
  if (!row?.ok || typeof row.sessionId !== "string") {
    throw new Error(typeof row?.error === "string" ? row.error : "Could not start call session.");
  }
  return {
    sessionId: row.sessionId,
    contactId: typeof row.contactId === "string" ? row.contactId : null,
    contactName: typeof row.contactName === "string" ? row.contactName : null,
    jobId: typeof row.jobId === "string" ? row.jobId : null,
    opportunityId: typeof row.opportunityId === "string" ? row.opportunityId : null,
  };
}

async function addLeg(input: {
  sessionId: string;
  staffId: string | null;
  kind: string;
  phone?: string;
  participantIdentity?: string;
}) {
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("calling_add_leg", {
    p_session_id: input.sessionId,
    p_staff_id: input.staffId,
    p_kind: input.kind,
    p_phone: input.phone ?? "",
    p_participant_identity: input.participantIdentity ?? "",
  });
  if (error) throw new Error(error.message);
  const row = asRecord(data);
  if (!row?.ok || typeof row.legId !== "string") {
    throw new Error(typeof row?.error === "string" ? row.error : "Could not add call leg.");
  }
  return row.legId;
}

async function getSession(sessionId: string) {
  const { data, error } = await createAnonClient().rpc("calling_get_session", {
    p_session_id: sessionId,
  });
  if (error) throw new Error(error.message);
  const row = asRecord(data);
  if (!row?.ok) throw new Error(typeof row?.error === "string" ? row.error : "Unknown call.");
  return row;
}

async function getLeg(legId: string) {
  const { data, error } = await createAnonClient().rpc("calling_get_leg", { p_leg_id: legId });
  if (error) throw new Error(error.message);
  const row = asRecord(data);
  if (!row?.ok) throw new Error(typeof row?.error === "string" ? row.error : "Unknown call leg.");
  return row;
}

export async function fanOutRing(options: {
  companyId: string;
  sessionId: string;
  roomName: string;
  trunkId: string;
  fromNumber: string;
  targets: CallRingTarget[];
}) {
  const supabase = createAnonClient();
  const legs: Array<{ legId: string; target: CallRingTarget; participantIdentity: string }> = [];

  for (const target of options.targets) {
    if (target.kind === "cell") {
      const e164 = toE164(target.phone);
      if (!e164) continue;
      const legId = await addLeg({
        sessionId: options.sessionId,
        staffId: target.staffId,
        kind: "cell",
        phone: e164,
      });
      const identity = cellLegIdentity(target.staffId, legId);
      await supabase.rpc("calling_set_leg_identity", {
        p_leg_id: legId,
        p_identity: identity,
      });
      legs.push({ legId, target, participantIdentity: identity });
      void dialSipParticipant({
        trunkId: options.trunkId,
        toNumber: e164,
        roomName: options.roomName,
        fromNumber: options.fromNumber,
        participantIdentity: identity,
        participantName: target.staffName || "Staff",
        waitUntilAnswered: false,
        ringingTimeout: target.ringTimeoutSeconds,
      }).catch(async () => {
        await createAnonClient().rpc("calling_fail_leg", { p_leg_id: legId });
      });
      continue;
    }

    const identity = softphoneIdentity(target.staffId);
    const legId = await addLeg({
      sessionId: options.sessionId,
      staffId: target.staffId,
      kind: target.kind,
      participantIdentity: identity,
    });
    legs.push({ legId, target, participantIdentity: identity });
  }
  return legs;
}

export async function handleInboundRoom(options: {
  companyId: string;
  roomName: string;
  fromNumber: string;
  toNumber: string;
  callerParticipantIdentity: string;
  livekitSipCallId?: string;
}) {
  if (!liveKitConfigured()) throw new Error("LiveKit is not configured.");
  const settings = await loadCallingSettings(options.companyId);
  if (!settings.ok || !settings.configured) {
    throw new Error("Calling is not configured for this office.");
  }

  const supabase = createAnonClient();
  const { data: routeData, error: routeError } = await supabase.rpc("calling_resolve_route", {
    p_company: options.companyId,
    p_to_number: options.toNumber || settings.officeLine,
  });
  if (routeError) throw new Error(routeError.message);
  const route = asRecord(routeData) ?? {};
  const queueId = typeof route.queueId === "string" ? route.queueId : null;
  const staffId = typeof route.staffId === "string" ? route.staffId : null;

  const existing = await supabase.rpc("calling_find_session_by_room", {
    p_room_name: options.roomName,
  });
  const existingRow = asRecord(existing.data);
  if (existingRow?.ok && existingRow.status === "ringing") {
    return { session: { sessionId: String(existingRow.id) }, deduped: true as const };
  }

  const session = await startSession({
    companyId: options.companyId,
    direction: "inbound",
    roomName: options.roomName,
    fromNumber: options.fromNumber,
    toNumber: options.toNumber || settings.officeLine,
    queueId,
    callerParticipantIdentity: options.callerParticipantIdentity,
    livekitSipCallId: options.livekitSipCallId,
    metadata: { route },
  });

  const targets = await ringTargets(options.companyId, queueId, staffId);
  const legs = await fanOutRing({
    companyId: options.companyId,
    sessionId: session.sessionId,
    roomName: options.roomName,
    trunkId: settings.livekitOutboundTrunkId,
    fromNumber: settings.officeLine,
    targets,
  });

  scheduleNoAnswer(session.sessionId, options.companyId, queueId, targets);
  return { session, targets, legs, settings, deduped: false as const };
}

function scheduleNoAnswer(
  sessionId: string,
  companyId: string,
  queueId: string | null,
  targets: CallRingTarget[],
) {
  const timeoutMs =
    Math.max(5, ...targets.map((target) => target.ringTimeoutSeconds || 25), 25) * 1000;
  setTimeout(() => {
    void maybeHandleNoAnswer({ sessionId, companyId, queueId }).catch(() => undefined);
  }, timeoutMs);
}

async function maybeHandleNoAnswer(options: {
  sessionId: string;
  companyId: string;
  queueId: string | null;
}) {
  const supabase = createAnonClient();
  const session = await getSession(options.sessionId).catch(() => null);
  if (!session || session.status !== "ringing") return;

  const { data: fallbackData } = await supabase.rpc("calling_queue_fallback", {
    p_queue_id: options.queueId,
  });
  const fallbackRow = asRecord(fallbackData) ?? {};
  const fallback =
    fallbackRow.fallback === "none" || fallbackRow.fallback === "voice_agent"
      ? fallbackRow.fallback
      : "missed_log";
  const voiceStaffId =
    typeof fallbackRow.voiceStaffId === "string" ? fallbackRow.voiceStaffId : null;

  await supabase.rpc("calling_end_session", {
    p_session_id: options.sessionId,
    p_status: "missed",
    p_disposition:
      fallback === "voice_agent"
        ? "No answer — forwarded to voice agent when configured."
        : "No answer",
    p_duration_seconds: null,
  });
  await supabase.rpc("calling_log_activity", { p_session_id: options.sessionId });

  if (fallback === "voice_agent" && voiceStaffId) {
    const { data: numberData } = await supabase.rpc("calling_voice_agent_number", {
      p_company: options.companyId,
      p_staff_id: voiceStaffId,
    });
    const numberRow = asRecord(numberData) ?? {};
    const forwardTo = toE164(typeof numberRow.number === "string" ? numberRow.number : "");
    const callerIdentity =
      typeof session.callerParticipantIdentity === "string"
        ? session.callerParticipantIdentity
        : "";
    const roomName = typeof session.roomName === "string" ? session.roomName : "";
    if (forwardTo && callerIdentity && roomName) {
      try {
        await transferSipParticipant({
          roomName,
          participantIdentity: callerIdentity,
          transferTo: forwardTo,
        });
      } catch {
        // Leave as missed if forward fails.
      }
    }
  }

  if (typeof session.roomName === "string") await deleteRoom(session.roomName);
}

export async function placeOutboundCall(options: {
  companyId: string;
  staffId: string;
  staffName: string;
  toNumber: string;
}) {
  if (!liveKitConfigured()) throw new Error("LiveKit is not configured.");
  const settings = await loadCallingSettings(options.companyId);
  if (!settings.ok || !settings.configured) {
    throw new Error("Enable calling under Settings → Calling first.");
  }
  const to = toE164(options.toNumber);
  if (!to) throw new Error("Enter a valid phone number.");

  const callId = randomUUID();
  const roomName = callRoomName(options.companyId, callId);
  const session = await startSession({
    companyId: options.companyId,
    direction: "outbound",
    roomName,
    fromNumber: settings.officeLine,
    toNumber: to,
    callerParticipantIdentity: softphoneIdentity(options.staffId),
  });

  const staffLegId = await addLeg({
    sessionId: session.sessionId,
    staffId: options.staffId,
    kind: "softphone",
    participantIdentity: softphoneIdentity(options.staffId),
  });
  await createAnonClient().rpc("calling_answer_leg", {
    p_leg_id: staffLegId,
    p_participant_identity: softphoneIdentity(options.staffId),
  });

  const pstnId = pstnIdentity(session.sessionId);
  await addLeg({
    sessionId: session.sessionId,
    staffId: null,
    kind: "pstn",
    phone: to,
    participantIdentity: pstnId,
  });

  const token = await mintSoftphoneToken({
    roomName,
    staffId: options.staffId,
    staffName: options.staffName,
  });

  void dialSipParticipant({
    trunkId: settings.livekitOutboundTrunkId,
    toNumber: to,
    roomName,
    fromNumber: settings.officeLine,
    participantIdentity: pstnId,
    participantName: to,
    waitUntilAnswered: false,
    playDialtone: true,
  }).catch(async () => {
    await createAnonClient().rpc("calling_end_session", {
      p_session_id: session.sessionId,
      p_status: "failed",
      p_disposition: "Outbound dial failed",
      p_duration_seconds: null,
    });
  });

  return {
    sessionId: session.sessionId,
    roomName,
    token: token.token,
    url: token.url,
    identity: token.identity,
    contactName: session.contactName,
    contactId: session.contactId,
    jobId: session.jobId,
    opportunityId: session.opportunityId,
  };
}

export async function answerSoftphoneLeg(options: {
  legId: string;
  staffId: string;
  staffName: string;
}) {
  if (!liveKitConfigured()) throw new Error("LiveKit is not configured.");
  const leg = await getLeg(options.legId);
  if (leg.staffId !== options.staffId) {
    throw new Error("That ringing call is not for this seat.");
  }
  if (leg.status !== "ringing") throw new Error("That call is no longer ringing.");

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("calling_answer_leg", {
    p_leg_id: options.legId,
    p_participant_identity: softphoneIdentity(options.staffId),
  });
  if (error) throw new Error(error.message);
  const result = asRecord(data);
  if (!result?.ok) {
    throw new Error(typeof result?.error === "string" ? result.error : "Could not answer.");
  }

  const session = await getSession(String(leg.sessionId));
  const cancelled = Array.isArray(result.cancelledLegIds) ? result.cancelledLegIds : [];
  for (const cancelledId of cancelled) {
    if (typeof cancelledId !== "string") continue;
    const other = await getLeg(cancelledId).catch(() => null);
    if (other && typeof other.participantIdentity === "string" && other.participantIdentity) {
      await removeParticipant(String(session.roomName), other.participantIdentity);
    }
  }

  const token = await mintSoftphoneToken({
    roomName: String(session.roomName),
    staffId: options.staffId,
    staffName: options.staffName,
  });

  return {
    sessionId: String(session.id),
    roomName: String(session.roomName),
    token: token.token,
    url: token.url,
    identity: token.identity,
    fromNumber: String(session.fromNumber ?? ""),
    toNumber: String(session.toNumber ?? ""),
  };
}

export async function hangupSession(options: {
  sessionId: string;
  disposition?: string;
}) {
  const session = await getSession(options.sessionId);
  const answeredAt =
    typeof session.answeredAt === "string" ? Date.parse(session.answeredAt) : NaN;
  const duration = Number.isFinite(answeredAt)
    ? Math.max(0, Math.round((Date.now() - answeredAt) / 1000))
    : null;

  const supabase = createAnonClient();
  await supabase.rpc("calling_end_session", {
    p_session_id: options.sessionId,
    p_status: session.status === "ringing" ? "missed" : "ended",
    p_disposition: options.disposition ?? "",
    p_duration_seconds: duration,
  });
  await supabase.rpc("calling_log_activity", { p_session_id: options.sessionId });
  if (typeof session.roomName === "string") await deleteRoom(session.roomName);
  return { ok: true as const };
}

export async function coldTransfer(options: {
  sessionId: string;
  targetStaffId?: string;
  targetNumber?: string;
}) {
  if (!liveKitConfigured()) throw new Error("LiveKit is not configured.");
  const session = await getSession(options.sessionId);
  if (session.status !== "active") throw new Error("No active call to transfer.");

  let transferTo = options.targetNumber ? toE164(options.targetNumber) : "";
  if (options.targetStaffId) {
    const targets = await ringTargets(String(session.companyId), null, options.targetStaffId);
    const cell = targets.find((target) => target.kind === "cell" && toE164(target.phone));
    if (cell) transferTo = toE164(cell.phone);
  }
  if (!transferTo) throw new Error("Pick a teammate with a cell endpoint or enter a number.");

  const participantIdentity =
    session.direction === "inbound"
      ? String(session.callerParticipantIdentity || "")
      : pstnIdentity(String(session.id));
  if (!participantIdentity) throw new Error("Could not find the PSTN participant to transfer.");

  await addLeg({
    sessionId: String(session.id),
    staffId: options.targetStaffId ?? null,
    kind: "transfer",
    phone: transferTo,
    participantIdentity: `transfer_${transferTo}`,
  });

  await transferSipParticipant({
    roomName: String(session.roomName),
    participantIdentity,
    transferTo,
  });

  const answeredAt =
    typeof session.answeredAt === "string" ? Date.parse(session.answeredAt) : NaN;
  const supabase = createAnonClient();
  await supabase.rpc("calling_end_session", {
    p_session_id: String(session.id),
    p_status: "transferred",
    p_disposition: `Cold transfer to ${transferTo}`,
    p_duration_seconds: Number.isFinite(answeredAt)
      ? Math.max(0, Math.round((Date.now() - answeredAt) / 1000))
      : null,
  });
  await supabase.rpc("calling_log_activity", { p_session_id: String(session.id) });
  return { ok: true as const, transferTo };
}

export async function warmTransfer(options: {
  sessionId: string;
  staffId: string;
  staffName: string;
  targetStaffId: string;
}) {
  if (!liveKitConfigured()) throw new Error("LiveKit is not configured.");
  const session = await getSession(options.sessionId);
  if (session.status !== "active") throw new Error("No active call to transfer.");

  const settings = await loadCallingSettings(String(session.companyId));
  if (!settings.ok || !settings.configured) throw new Error("Calling is not configured.");

  const consultRoom = `${session.roomName}_consult_${options.targetStaffId.replace(/-/g, "").slice(0, 8)}`;
  const targets = await ringTargets(String(session.companyId), null, options.targetStaffId);
  const cell = targets.find((target) => target.kind === "cell" && toE164(target.phone));

  const consultToken = await mintSoftphoneToken({
    roomName: consultRoom,
    staffId: options.targetStaffId,
    staffName: "Consult",
  });
  const agentToken = await mintSoftphoneToken({
    roomName: consultRoom,
    staffId: options.staffId,
    staffName: options.staffName,
  });

  await addLeg({
    sessionId: String(session.id),
    staffId: options.targetStaffId,
    kind: "transfer",
    phone: cell ? toE164(cell.phone) : "",
    participantIdentity: softphoneIdentity(options.targetStaffId),
  });

  if (cell) {
    const e164 = toE164(cell.phone);
    void dialSipParticipant({
      trunkId: settings.livekitOutboundTrunkId,
      toNumber: e164,
      roomName: consultRoom,
      fromNumber: settings.officeLine,
      participantIdentity: cellLegIdentity(options.targetStaffId, randomUUID()),
      participantName: "Warm transfer",
      waitUntilAnswered: false,
      ringingTimeout: cell.ringTimeoutSeconds,
    }).catch(() => undefined);
  }

  return {
    ok: true as const,
    consultRoom,
    agentToken: agentToken.token,
    targetToken: consultToken.token,
    url: agentToken.url,
    mode: "warm" as const,
    note: "Consult in the side room, then complete the warm transfer to hand the caller over.",
  };
}

export async function completeWarmTransfer(options: {
  sessionId: string;
  targetStaffId: string;
}) {
  return coldTransfer({
    sessionId: options.sessionId,
    targetStaffId: options.targetStaffId,
  });
}
