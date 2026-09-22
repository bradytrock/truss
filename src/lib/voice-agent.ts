export const VOICE_AUTHOR_PREFIX = "Voice · ";

export type VoiceIntakeAction = "attach" | "create";

export type VoiceMatchKind = "open_job" | "past_client" | "unknown";

export type VoiceAgentRecord = {
  id: string;
  companyId: string;
  staffId: string;
  elevenlabsAgentId: string;
  inboundNumber: string;
  webhookToken: string;
  enabled: boolean;
};

export type VoiceIntakeDecision = {
  action: VoiceIntakeAction;
  ownerStaffId: string;
  originatorStaffId: string;
  matchKind: VoiceMatchKind;
  jobId?: string | null;
  opportunityId?: string | null;
  contactId?: string | null;
};

export function voiceAuthor(staffName: string) {
  const name = staffName.trim() || "desk";
  return `${VOICE_AUTHOR_PREFIX}${name}`;
}

export function isVoiceAuthor(author: string | null | undefined) {
  return (author ?? "").startsWith(VOICE_AUTHOR_PREFIX);
}

/** Open production card — do not mint a second one. */
export function isOpenVoiceJob(job: { deletedAt?: string | null; status?: string | null }) {
  if (job.deletedAt) return false;
  return job.status !== "complete";
}

export function isOpenVoiceOpportunity(opportunity: { stage?: string | null }) {
  return opportunity.stage !== "lost";
}

/**
 * Called PM is A. If the household already has an open card, attach there
 * (owner stays whoever owns that card). If they are a past client of B and B
 * still has a seat, create on B with originator A. Otherwise create on A.
 */
export function decideVoiceIntake(input: {
  calledStaffId: string;
  openJob?: { id: string; opportunityId?: string | null; ownerStaffId?: string; contactId?: string | null } | null;
  openOpportunity?: { id: string; ownerStaffId?: string; contactId?: string | null } | null;
  pastOwner?: { staffId: string; assignable: boolean; contactId?: string | null } | null;
}): VoiceIntakeDecision {
  const called = input.calledStaffId;
  if (input.openJob?.id) {
    return {
      action: "attach",
      ownerStaffId: input.openJob.ownerStaffId || called,
      originatorStaffId: called,
      matchKind: "open_job",
      jobId: input.openJob.id,
      opportunityId: input.openJob.opportunityId ?? null,
      contactId: input.openJob.contactId ?? null,
    };
  }
  if (input.openOpportunity?.id) {
    return {
      action: "attach",
      ownerStaffId: input.openOpportunity.ownerStaffId || called,
      originatorStaffId: called,
      matchKind: "open_job",
      jobId: null,
      opportunityId: input.openOpportunity.id,
      contactId: input.openOpportunity.contactId ?? null,
    };
  }
  if (input.pastOwner?.staffId && input.pastOwner.assignable) {
    return {
      action: "create",
      ownerStaffId: input.pastOwner.staffId,
      originatorStaffId: called,
      matchKind: "past_client",
      contactId: input.pastOwner.contactId ?? null,
    };
  }
  return {
    action: "create",
    ownerStaffId: called,
    originatorStaffId: called,
    matchKind: "unknown",
    contactId: input.pastOwner?.contactId ?? null,
  };
}

export function voiceNotifySms(input: {
  action: VoiceIntakeAction;
  matchKind: VoiceMatchKind;
  callerName: string;
  calledStaffName: string;
  ownerName: string;
  jobCode: string;
  notes: string;
}) {
  const who = input.callerName.trim() || "A homeowner";
  const line = input.calledStaffName.trim() || "another PM";
  const code = input.jobCode.trim();
  const extra = input.notes.trim() ? ` ${input.notes.trim()}` : "";
  if (input.action === "attach") {
    return `${who} called ${line}'s line about ${code || "your job"}.${extra} Logged on the job — no new card.`;
  }
  if (input.matchKind === "past_client") {
    return `${who} called ${line}'s line. New lead ${code || ""} is on your book.${extra}`.replace(/\s+/g, " ").trim();
  }
  return `${who} called your line. New lead ${code || ""} is on your book.${extra}`.replace(/\s+/g, " ").trim();
}

export function voiceCallActivityBody(input: {
  calledStaffName: string;
  ownerName: string;
  action: VoiceIntakeAction;
  transcript?: string;
  notes?: string;
  durationSeconds?: number | null;
}) {
  const parts = [
    input.action === "attach"
      ? `Missed call on ${input.calledStaffName.trim() || "a"}'s line. Logged on this job; ${input.ownerName.trim() || "the owner"} was notified. No new card.`
      : `Missed call on ${input.calledStaffName.trim() || "a"}'s line. Opened this lead for ${input.ownerName.trim() || "the desk"}.`,
  ];
  if (input.durationSeconds && input.durationSeconds > 0) {
    parts.push(`Duration ${Math.round(input.durationSeconds)}s.`);
  }
  const notes = input.notes?.trim();
  if (notes) parts.push(notes);
  const transcript = input.transcript?.trim();
  if (transcript) parts.push(`Transcript: ${transcript}`);
  return parts.join(" ");
}

export function voiceBookActivityBody(input: { title: string; startsAt: string; assignee: string }) {
  return `Booked ${input.title} for ${input.assignee} at ${input.startsAt}.`;
}

export function mintVoiceWebhookToken() {
  const bytes = new Uint8Array(24);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function voiceToolPaths() {
  return {
    lookup: "/api/voice/lookup",
    intake: "/api/voice/intake",
    book: "/api/voice/book",
    log: "/api/voice/log",
  } as const;
}
