import { localYmd } from "@/lib/format";
import { isDeletedJob } from "@/lib/job-record";
import { phoneKey, type MessageThread } from "@/lib/job-messages";
import { firstName } from "@/lib/phone";
import type {
  Activity,
  ClientType,
  GmailMessage,
  Job,
  JobMarket,
  JobStatus,
  Opportunity,
  PipelineStage,
  ScheduleEvent,
  TextMessage,
} from "@/lib/types";
import { CLIENT_TYPE_LABELS, EVENT_KIND_LABELS, JOB_STATUS_LABELS, STAGE_LABELS } from "@/lib/types";

export type InboxScope = "mine" | "all" | "unread" | "unassigned";
export type InboxQueue = "needs_reply" | "waiting";
export type InboxChannel = "all" | "texts" | "email" | "calls" | "notes";
export type InboxChip = "Referral" | "New lead" | "Web" | "Automated";

const AUTO_KINDS = new Set(["automation", "automated", "system", "workflow", "auto"]);

export function isAutomatedText(
  message: Pick<TextMessage, "kind" | "createdBy" | "body" | "detail" | "direction">,
) {
  const kind = (message.kind || "").trim().toLowerCase();
  if (AUTO_KINDS.has(kind)) return true;
  const author = (message.createdBy || "").trim().toLowerCase();
  if (message.direction === "outbound" && /^(automation|system|workflow|truss)$/.test(author)) return true;
  const blob = `${message.body || ""}\n${message.detail || ""}`.toLowerCase();
  if (message.direction === "outbound" && /\bon my way\b|\bon-my-way\b/.test(blob)) return true;
  if (/live arrival|crmtrack\.com/.test(blob)) return true;
  return false;
}

export function threadIsAutomated(messages: Array<Parameters<typeof isAutomatedText>[0]> | null | undefined) {
  return (messages ?? []).some((message) => message && isAutomatedText(message));
}

export function onMyWayText(message: Pick<TextMessage, "body" | "detail" | "kind">) {
  const blob = `${message.body || ""} ${message.detail || ""} ${message.kind || ""}`.toLowerCase();
  return /\bon my way\b|\bon-my-way\b|\bomw\b/.test(blob);
}

export function inboxQueue(
  thread: { messages?: Array<{ direction?: string; createdAt?: string; kind?: string }> | null },
  closedAt?: string | null,
): InboxQueue {
  const messages = (thread.messages ?? []).filter((message) => message && message.kind !== "reaction");
  const last = [...messages].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")).at(-1);
  if (!last || last.direction !== "inbound") return "waiting";
  if (closedAt && (last.createdAt || "") <= closedAt) return "waiting";
  return "needs_reply";
}

export function threadOwnerId(
  thread: Pick<MessageThread, "contact" | "job" | "opportunity"> | {
    contact?: { ownerStaffId?: string } | null;
    job?: { ownerStaffId?: string } | null;
    opportunity?: { ownerStaffId?: string } | null;
  },
) {
  return thread.contact?.ownerStaffId || thread.job?.ownerStaffId || thread.opportunity?.ownerStaffId || "";
}

function sameName(left: string | null | undefined, right: string | null | undefined) {
  const a = (left || "").trim().toLowerCase();
  const b = (right || "").trim().toLowerCase();
  return Boolean(a) && a === b;
}

export function threadIsMine(
  thread: {
    contact?: { ownerStaffId?: string } | null;
    job?: { ownerStaffId?: string; salesRep?: string; projectManager?: string; superintendent?: string } | null;
    opportunity?: { ownerStaffId?: string; estimator?: string; assignedTo?: string } | null;
  },
  viewer: { staffId?: string; name?: string },
) {
  const ownerId = threadOwnerId(thread);
  if (viewer.staffId && ownerId && ownerId === viewer.staffId) return true;
  const name = viewer.name || "";
  if (!name.trim()) return false;
  return (
    sameName(thread.job?.salesRep, name) ||
    sameName(thread.job?.projectManager, name) ||
    sameName(thread.job?.superintendent, name) ||
    sameName(thread.opportunity?.estimator, name) ||
    sameName(thread.opportunity?.assignedTo, name)
  );
}

export function threadIsUnassigned(thread: Parameters<typeof threadIsMine>[0]) {
  if (threadOwnerId(thread)) return false;
  if ((thread.job?.salesRep || "").trim()) return false;
  if ((thread.opportunity?.estimator || "").trim()) return false;
  if ((thread.opportunity?.assignedTo || "").trim()) return false;
  return true;
}

export function threadMatchesScope(input: {
  scope: InboxScope;
  mine: boolean;
  unread: boolean;
  unassigned: boolean;
  automatedOnly: boolean;
  automated: boolean;
}) {
  if (input.automatedOnly && !input.automated) return false;
  if (input.scope === "mine") return input.mine;
  if (input.scope === "unread") return input.unread;
  if (input.scope === "unassigned") return input.unassigned;
  return true;
}

export function inboxChips(input: {
  contact?: { isReferralPartner?: boolean } | null;
  job?: { leadSource?: string } | null;
  opportunity?: { leadSource?: string; stage?: string } | null;
  automated?: boolean;
  web?: boolean;
}): InboxChip[] {
  const chips: InboxChip[] = [];
  const source = input.opportunity?.leadSource || input.job?.leadSource || "";
  if (input.contact?.isReferralPartner || source === "referral" || source === "realtor") chips.push("Referral");
  const newLead = Boolean(
    input.opportunity &&
      !input.job &&
      (input.opportunity.stage === "pursuing" || input.opportunity.stage === "estimating"),
  );
  if (newLead) chips.push("New lead");
  if (
    input.web ||
    source === "website" ||
    source === "google_ad" ||
    source === "social_media" ||
    source === "chatgpt"
  ) {
    chips.push("Web");
  }
  if (input.automated) chips.push("Automated");
  return chips;
}

export function shortStaffName(name: string | null | undefined) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export function formatCallDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  if (minutes === 0) return `${remain}s`;
  return `${minutes}m ${remain.toString().padStart(2, "0")}s`;
}

export function firstHttpUrl(text: string | null | undefined) {
  const match = (text || "").match(/https?:\/\/[^\s<>"')\]]+/i);
  return match?.[0] ?? "";
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function formatInboxDay(iso: string | null | undefined, now = new Date()) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (localYmd(date) === localYmd(now)) return "Today";
  return date
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();
}

export function textStatusLabel(status: string | null | undefined, direction: "inbound" | "outbound") {
  const key = (status ?? "").toLowerCase();
  if (key === "unsent") return "Unsent";
  if (key === "failed" || key === "error" || key === "undelivered") return "Failed";
  if (key === "queued" || key === "sending") return "Sending";
  if (key === "delivered") return direction === "outbound" ? "Delivered" : "Received";
  return direction === "outbound" ? "Sent" : "Received";
}

export function textStatusTone(status: string | null | undefined): "ok" | "bad" | "muted" {
  const key = (status ?? "").toLowerCase();
  if (key === "failed" || key === "error" || key === "undelivered") return "bad";
  if (key === "queued" || key === "sending" || key === "unsent") return "muted";
  return "ok";
}

export function jobsForPeople(jobs: Job[], opportunities: Opportunity[], contactIds: string[]) {
  const ids = new Set(contactIds.filter(Boolean));
  if (ids.size === 0) return [];
  return jobs.filter((job) => {
    if (!job || isDeletedJob(job)) return false;
    if (job.primaryContactId && ids.has(job.primaryContactId)) return true;
    if ((job.relatedContactIds || []).some((id) => ids.has(id))) return true;
    const opportunity = job.opportunityId
      ? opportunities.find((row) => row.id === job.opportunityId)
      : undefined;
    return Boolean(opportunity && ids.has(opportunity.primaryContactId));
  });
}

const NEXT_JOB: Record<JobStatus, string> = {
  precon: "Start production",
  in_progress: "Punch next",
  punch: "Close out",
  complete: "Warranty",
  on_hold: "Resume",
};

const NEXT_STAGE: Record<PipelineStage, string> = {
  pursuing: "Estimate next",
  estimating: "Proposal next",
  bid_submitted: "Follow-up next",
  interview: "Decision next",
  supplementing: "Award next",
  awarded: "Schedule next",
  lost: "Closed",
  unqualified: "Closed",
};

export function inboxStage(input: {
  job?: { status: JobStatus } | null;
  opportunity?: { stage: PipelineStage; nextStep?: string } | null;
  inspected?: boolean;
  hasSentEstimate?: boolean;
}) {
  const nextStep = input.opportunity?.nextStep?.trim() || "";
  const shortStep = nextStep.length > 0 && nextStep.length <= 42 ? nextStep : "";
  const detail = nextStep.length > 42 ? nextStep : "";
  if (input.inspected && !input.hasSentEstimate) {
    return { current: "Inspected", next: shortStep || "Estimate next", detail };
  }
  if (input.job) {
    return {
      current: JOB_STATUS_LABELS[input.job.status] || "Job",
      next: shortStep || NEXT_JOB[input.job.status] || "",
      detail,
    };
  }
  if (input.opportunity) {
    return {
      current: STAGE_LABELS[input.opportunity.stage] || "Lead",
      next: shortStep || NEXT_STAGE[input.opportunity.stage] || "",
      detail,
    };
  }
  return { current: "New", next: "", detail };
}

export function inboxRoleLabel(input: {
  title?: string | null;
  clientType?: ClientType | null;
  market?: JobMarket | "" | null;
}) {
  const title = input.title?.trim();
  if (title) return title;
  if (input.clientType && CLIENT_TYPE_LABELS[input.clientType]) return CLIENT_TYPE_LABELS[input.clientType];
  if (input.market === "commercial") return "Commercial";
  return "Homeowner";
}

export function inboxAddress(
  job?: Pick<Job, "street" | "city" | "state" | "postalCode" | "location"> | null,
  opportunity?: Pick<Opportunity, "street" | "city" | "state" | "postalCode" | "location"> | null,
) {
  const street = (job?.street || opportunity?.street || "").trim();
  const city = (job?.city || opportunity?.city || "").trim();
  const state = (job?.state || opportunity?.state || "").trim();
  const zip = (job?.postalCode || opportunity?.postalCode || "").trim();
  const cityLine = [city, state].filter(Boolean).join(", ");
  const line2 = [cityLine, zip].filter(Boolean).join(" ");
  const fallback = (job?.location || opportunity?.location || "").trim();
  return {
    street: street || fallback || "No address yet",
    line2: street ? line2 : "",
  };
}

export function nextAppointment(events: ScheduleEvent[], jobId: string | null | undefined, now = new Date()) {
  if (!jobId) return undefined;
  const cutoff = now.getTime() - 60_000;
  return [...events]
    .filter((event) => event.jobId === jobId && new Date(event.startsAt).getTime() >= cutoff)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
}

export function appointmentLabel(event: Pick<ScheduleEvent, "title" | "kind" | "startsAt"> | null | undefined) {
  if (!event) return "";
  const when = new Date(event.startsAt);
  const day = Number.isNaN(when.getTime())
    ? ""
    : when.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const title = event.title?.trim() || EVENT_KIND_LABELS[event.kind] || "Appointment";
  return day ? `${day} · ${title}` : title;
}

export function reviewRequestDraft(name: string | null | undefined) {
  return `Hi ${firstName(name || "")}, thanks for having us out. If the work went well, a short review helps the crew a lot.`;
}

export type InboxCall = {
  id: string;
  direction: "inbound" | "outbound";
  startedAt: string;
  durationSeconds: number | null;
  status: string;
  contactId?: string | null;
  jobId?: string | null;
  fromNumber?: string;
  toNumber?: string;
};

export type InboxTimelineEntry =
  | { id: string; at: string; kind: "text"; message: TextMessage }
  | { id: string; at: string; kind: "email"; message: GmailMessage }
  | {
      id: string;
      at: string;
      kind: "call";
      direction: "inbound" | "outbound";
      durationSeconds: number | null;
      status: string;
    }
  | { id: string; at: string; kind: "note"; author: string; body: string };

function matchesFocusedJob(itemJobId: string | null | undefined, focusJobId: string | null, primaryJobId: string | null) {
  if (!focusJobId) return true;
  if (itemJobId && itemJobId === focusJobId) return true;
  if (!itemJobId && focusJobId === primaryJobId) return true;
  return false;
}

function withinMinutes(left: string, right: string, minutes: number) {
  const a = new Date(left).getTime();
  const b = new Date(right).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= minutes * 60_000;
}

export function buildInboxTimeline(input: {
  messages: TextMessage[];
  emails: GmailMessage[];
  calls: InboxCall[];
  activities: Activity[];
  contactIds: string[];
  phone: string;
  focusJobId: string | null;
  primaryJobId: string | null;
  jobIds: string[];
  opportunityIds: string[];
  clientIds?: string[];
  channel: InboxChannel;
}): InboxTimelineEntry[] {
  const contacts = new Set(input.contactIds.filter(Boolean));
  const jobs = new Set(input.jobIds.filter(Boolean));
  const opportunities = new Set(input.opportunityIds.filter(Boolean));
  const clients = new Set((input.clientIds ?? []).filter(Boolean));
  const phone = phoneKey(input.phone);
  const entries: InboxTimelineEntry[] = [];

  for (const message of input.messages) {
    if (!message?.id) continue;
    if (message.kind === "reaction") continue;
    if (!matchesFocusedJob(message.jobId, input.focusJobId, input.primaryJobId)) continue;
    entries.push({ id: `text:${message.id}`, at: message.createdAt || "", kind: "text", message });
  }

  const emails = input.emails.filter((message) => {
    if (!message?.id) return false;
    const contactHit =
      (message.contactId && contacts.has(message.contactId)) ||
      (message.relatedContactIds || []).some((id) => contacts.has(id));
    const jobHit = Boolean(message.jobId && jobs.has(message.jobId));
    if (!contactHit && !jobHit) return false;
    return matchesFocusedJob(message.jobId, input.focusJobId, input.primaryJobId);
  });
  for (const message of emails) {
    entries.push({ id: `email:${message.id}`, at: message.receivedAt || "", kind: "email", message });
  }

  const calls = input.calls.filter((call) => {
    const phoneHit =
      (phone && phoneKey(call.fromNumber) === phone) || (phone && phoneKey(call.toNumber) === phone);
    const contactHit = Boolean(call.contactId && contacts.has(call.contactId));
    const jobHit = Boolean(call.jobId && jobs.has(call.jobId));
    if (!phoneHit && !contactHit && !jobHit) return false;
    return matchesFocusedJob(call.jobId, input.focusJobId, input.primaryJobId);
  });
  for (const call of calls) {
    entries.push({
      id: `call:${call.id}`,
      at: call.startedAt || "",
      kind: "call",
      direction: call.direction === "outbound" ? "outbound" : "inbound",
      durationSeconds: call.durationSeconds,
      status: call.status || "",
    });
  }

  for (const activity of input.activities) {
    if (!activity?.id) continue;
    if (activity.type !== "note" && activity.type !== "call" && activity.type !== "email") continue;
    const onJob = activity.entityType === "job" && jobs.has(activity.entityId);
    const onOpportunity = activity.entityType === "opportunity" && opportunities.has(activity.entityId);
    const onClient = activity.entityType === "client" && clients.has(activity.entityId);
    if (!onJob && !onOpportunity && !onClient) continue;
    if (input.focusJobId && activity.entityType === "job" && activity.entityId !== input.focusJobId) continue;
    if (input.focusJobId && onClient) continue;
    if (activity.type === "call") {
      const duplicate = calls.some((call) => withinMinutes(call.startedAt, activity.createdAt, 3));
      if (duplicate) continue;
      entries.push({
        id: `activity-call:${activity.id}`,
        at: activity.createdAt || "",
        kind: "call",
        direction: "outbound",
        durationSeconds: null,
        status: "logged",
      });
      continue;
    }
    if (activity.type === "email") {
      const duplicate = emails.some((message) => withinMinutes(message.receivedAt, activity.createdAt, 10));
      if (duplicate) continue;
      entries.push({
        id: `activity-email:${activity.id}`,
        at: activity.createdAt || "",
        kind: "email",
        message: {
          id: activity.id,
          accountId: "",
          gmailId: "",
          threadId: activity.id,
          fromName: activity.author || "",
          fromEmail: "",
          toEmail: "",
          subject: "Email",
          snippet: activity.body || "",
          bodyText: activity.body || "",
          receivedAt: activity.createdAt,
          direction: "outbound",
          jobId: activity.entityType === "job" ? activity.entityId : null,
          contactId: null,
          ccEmail: "",
          relatedContactIds: [],
        },
      });
      continue;
    }
    entries.push({
      id: `note:${activity.id}`,
      at: activity.createdAt || "",
      kind: "note",
      author: activity.author || "",
      body: activity.body || "",
    });
  }

  const channel = input.channel;
  return entries
    .filter((entry) => {
      if (channel === "all") return true;
      if (channel === "texts") return entry.kind === "text";
      if (channel === "email") return entry.kind === "email";
      if (channel === "calls") return entry.kind === "call";
      return entry.kind === "note";
    })
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
