import { localYmd } from "@/lib/format";
import { isDeletedJob } from "@/lib/job-record";
import { phoneKey, type MessageThread } from "@/lib/job-messages";
import { firstName } from "@/lib/phone";
import type {
  Activity,
  ClientType,
  Estimate,
  EstimateSignatureEvent,
  GmailMessage,
  Invoice,
  Job,
  JobMarket,
  JobStatus,
  Opportunity,
  Payment,
  PipelineStage,
  ScheduleEvent,
  TextMessage,
} from "@/lib/types";
import { CLIENT_TYPE_LABELS, EVENT_KIND_LABELS, JOB_STATUS_LABELS, STAGE_LABELS } from "@/lib/types";
import type { WorkColumn } from "@/lib/work-board";

export type InboxScope = "mine" | "all" | "unread" | "unassigned";
export type InboxQueue = "needs_reply" | "waiting";
export type InboxChannel = "all" | "messages" | "texts" | "email" | "calls" | "notes" | "activity";
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

export type InboxNextAction = {
  title: string;
  stage: string;
  action: string;
  /** Work-board column the action moves the job to. Empty when the action opens the record. */
  column: WorkColumn | null;
};

const NEXT_WORK: Partial<Record<JobStatus, { action: string; column: WorkColumn; verb: string }>> = {
  in_progress: { action: "Start punch", column: "punch", verb: "punch next" },
  punch: { action: "Close out", column: "complete", verb: "close out" },
  on_hold: { action: "Resume", column: "in_progress", verb: "resume" },
};

/** The green next-step card: where this job is, and the one move that follows. */
export function inboxNextAction(input: {
  job?: { status: JobStatus; contractValue?: number } | null;
  opportunity?: { stage: PipelineStage } | null;
}): InboxNextAction | null {
  const job = input.job;
  const opportunity = input.opportunity;
  if (job?.status === "precon") {
    const sold = opportunity?.stage === "awarded" || (job.contractValue ?? 0) > 0;
    return {
      title: sold ? "Job sold → start precon" : "Preconstruction → start production",
      stage: "Preconstruction",
      action: sold ? "Start precon" : "Start production",
      column: sold ? null : "in_progress",
    };
  }
  if (job) {
    const next = NEXT_WORK[job.status];
    const stage = JOB_STATUS_LABELS[job.status] || "Job";
    if (!next) return { title: stage, stage, action: "", column: null };
    return {
      title: `${stage} → ${next.verb}`,
      stage,
      action: next.action,
      column: next.column,
    };
  }
  if (opportunity) {
    const stage = STAGE_LABELS[opportunity.stage] || "Lead";
    const verb = (NEXT_STAGE[opportunity.stage] || "").replace(/\s+next$/, "").toLowerCase();
    return {
      title: verb ? `${stage} → ${verb}` : stage,
      stage,
      action: verb ? verb.charAt(0).toUpperCase() + verb.slice(1) : "",
      column: null,
    };
  }
  return null;
}

export function inboxMoney(value: number) {
  const cents = Math.round(Math.abs(value) * 100) % 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents === 0 ? 0 : 2,
    maximumFractionDigits: cents === 0 ? 0 : 2,
  }).format(value);
}

const VIEWING_WINDOW_MS = 15 * 60 * 1000;

export function inboxViewers(input: {
  opens: Array<{ profileId: string; threadKey: string; openedAt: string }> | null | undefined;
  people: Array<{ id: string; name: string }>;
  threadKey: string;
  selfProfileId?: string;
  now?: number;
}) {
  if (!input.threadKey) return [];
  const now = input.now ?? Date.now();
  const names = new Map(input.people.map((person) => [person.id, person.name]));
  const seen = new Set<string>();
  const viewers: Array<{ id: string; name: string }> = [];
  for (const open of input.opens ?? []) {
    if (!open || open.threadKey !== input.threadKey) continue;
    if (input.selfProfileId && open.profileId === input.selfProfileId) continue;
    const at = new Date(open.openedAt).getTime();
    if (!Number.isFinite(at) || now - at > VIEWING_WINDOW_MS || now < at) continue;
    if (seen.has(open.profileId)) continue;
    seen.add(open.profileId);
    const name = names.get(open.profileId);
    if (!name) continue;
    viewers.push({ id: open.profileId, name });
  }
  return viewers;
}

export function inboxSeen(input: {
  opens: Array<{ profileId: string; threadKey: string; openedAt: string }> | null | undefined;
  people: Array<{ id: string; name: string }>;
  threadKey: string;
}) {
  const opened = new Set(
    (input.opens ?? [])
      .filter((open) => open && open.threadKey === input.threadKey)
      .map((open) => open.profileId),
  );
  const seen: Array<{ id: string; name: string }> = [];
  const unseen: Array<{ id: string; name: string }> = [];
  const used = new Set<string>();
  for (const person of input.people) {
    if (!person?.id || used.has(person.id)) continue;
    used.add(person.id);
    if (opened.has(person.id)) seen.push(person);
    else unseen.push(person);
  }
  return { seen, unseen };
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

export type InboxTextTemplate = { id: string; label: string; body: string };

export function inboxTextTemplates(name: string | null | undefined): InboxTextTemplate[] {
  const who = firstName(name || "");
  return [
    { id: "on-my-way", label: "On my way", body: `Hi ${who}, I'm on my way.` },
    {
      id: "running-late",
      label: "Running late",
      body: `Hi ${who}, running a few minutes late. I'll text when I'm close.`,
    },
    {
      id: "proposal",
      label: "Proposal follow-up",
      body: `Hi ${who}, your proposal is ready whenever you are. Reply here with any questions.`,
    },
    { id: "review", label: "Review request", body: reviewRequestDraft(name) },
    {
      id: "materials",
      label: "Materials confirmed",
      body: `Hi ${who}, materials are confirmed. We can start as planned.`,
    },
  ];
}

/** The `/query` token sitting at the cursor, if the writer is asking for a template. */
export function inboxSlashQuery(value: string, cursor: number) {
  const upto = value.slice(0, Math.max(0, Math.min(cursor, value.length)));
  const match = upto.match(/(?:^|\s)\/([^\s/]*)$/);
  if (!match) return null;
  const query = match[1] ?? "";
  return { query, start: upto.length - query.length - 1 };
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
  | { id: string; at: string; kind: "note"; author: string; body: string }
  | { id: string; at: string; kind: "event"; label: string; icon: "open" | "payment" | "work" };

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
  signatureEvents?: EstimateSignatureEvent[];
  estimates?: Array<Pick<Estimate, "id" | "number" | "jobId" | "opportunityId">>;
  payments?: Payment[];
  invoices?: Array<Pick<Invoice, "id" | "number" | "jobId">>;
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
    const work =
      activity.type === "meeting" || activity.type === "site_walk" || activity.type === "stage_change";
    if (activity.type !== "note" && activity.type !== "call" && activity.type !== "email" && !work) continue;
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
    if (work) {
      const who = shortStaffName(activity.author);
      const body = (activity.body || "").trim();
      entries.push({
        id: `event:${activity.id}`,
        at: activity.createdAt || "",
        kind: "event",
        icon: "work",
        label: [who, body].filter(Boolean).join(" · ") || "Activity",
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

  const estimateById = new Map((input.estimates ?? []).map((estimate) => [estimate.id, estimate]));
  const opened = new Map<string, EstimateSignatureEvent[]>();
  for (const event of input.signatureEvents ?? []) {
    if (!event?.id || !event.estimateId) continue;
    const estimate = estimateById.get(event.estimateId);
    if (!estimate) continue;
    const onJob = Boolean(estimate.jobId && jobs.has(estimate.jobId));
    const onOpportunity = Boolean(estimate.opportunityId && opportunities.has(estimate.opportunityId));
    if (!onJob && !onOpportunity) continue;
    if (!matchesFocusedJob(estimate.jobId, input.focusJobId, input.primaryJobId)) continue;
    if (event.kind === "opened") {
      const groupKey = `${event.estimateId}:${(event.signerName || "").trim().toLowerCase()}`;
      const group = opened.get(groupKey) ?? [];
      group.push(event);
      opened.set(groupKey, group);
      continue;
    }
    if (event.kind !== "signed" && event.kind !== "declined") continue;
    const who = (event.signerName || "").trim() ? firstName(event.signerName) : "Someone";
    const number = estimate.number ? ` ${estimate.number}` : "";
    entries.push({
      id: `sign:${event.id}`,
      at: event.createdAt || "",
      kind: "event",
      icon: "open",
      label: `${who} ${event.kind} proposal${number}`,
    });
  }
  for (const [groupKey, group] of opened) {
    const latest = [...group].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")).at(-1);
    if (!latest) continue;
    const estimate = estimateById.get(latest.estimateId);
    const who = (latest.signerName || "").trim() ? firstName(latest.signerName) : "Someone";
    const number = estimate?.number || "a proposal";
    entries.push({
      id: `open:${groupKey}`,
      at: latest.createdAt || "",
      kind: "event",
      icon: "open",
      label:
        group.length > 1
          ? `${who} opened ${number} · ${group.length}×`
          : `${who} opened proposal ${number}`,
    });
  }

  const invoiceById = new Map((input.invoices ?? []).map((invoice) => [invoice.id, invoice]));
  for (const payment of input.payments ?? []) {
    if (!payment?.id || payment.postingStatus === "rejected") continue;
    const invoice = payment.invoiceId ? invoiceById.get(payment.invoiceId) : undefined;
    const jobId = payment.jobId || invoice?.jobId || null;
    if (!jobId || !jobs.has(jobId)) continue;
    if (!matchesFocusedJob(jobId, input.focusJobId, input.primaryJobId)) continue;
    const who = shortStaffName(payment.createdBy) || "Office";
    const amount = Number.isFinite(payment.amount) ? inboxMoney(payment.amount) : "";
    const onInvoice = invoice?.number ? ` on ${invoice.number}` : "";
    entries.push({
      id: `pay:${payment.id}`,
      at: payment.paidAt || "",
      kind: "event",
      icon: "payment",
      label: amount ? `${who} recorded payment of ${amount}${onInvoice}` : `${who} recorded a payment${onInvoice}`,
    });
  }

  const channel = input.channel;
  return entries
    .filter((entry) => {
      if (channel === "all") return true;
      if (channel === "messages") return entry.kind === "text" || entry.kind === "email";
      if (channel === "texts") return entry.kind === "text";
      if (channel === "email") return entry.kind === "email";
      if (channel === "calls") return entry.kind === "call";
      if (channel === "activity") return entry.kind === "call" || entry.kind === "event";
      return entry.kind === "note";
    })
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
