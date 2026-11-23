import { hasEstimateSignature } from "./estimate-signature.ts";
import { isShelvedStage, type EstimateStatus, type JobStatus, type PipelineStage } from "./types.ts";
import type { WorkColumn } from "./work-board.ts";

/**
 * One sequence for the next thing to do on a job.
 * Sales runs call → text → inspection → estimate → send → supplement or follow-up → sold.
 * Sending the proposal is what moves the card to Proposal sent. This step opens that draft.
 * Production starts only after the job is sold, then punch, closeout, and warranty.
 * The first open step is the next step. Call, text, and scheduling can sit together
 * before the inspection is on the calendar. The estimate waits for that visit.
 */
export const NEXT_STEP_IDS = [
  "call",
  "text",
  "schedule",
  "estimate",
  "send",
  "supplement",
  "follow_up",
  "sold",
  "production",
  "punch",
  "closeout",
  "warranty",
  "resume",
] as const;

export type NextStepId = (typeof NEXT_STEP_IDS)[number];

export type NextStep = {
  id: NextStepId;
  title: string;
  /** Button label. Empty when there is nothing to press. */
  action: string;
  /** Board column this action moves to. Null when the action stays on the record. */
  column: WorkColumn | null;
  /** Opportunity stage this action writes when it does not move a board column. */
  stage: PipelineStage | null;
  detail: string;
  prompt: string;
};

export type NextStepFacts = {
  status?: JobStatus | null;
  stage?: PipelineStage | null;
  contractValue?: number;
  /** True once a call is logged. Omit when the caller has not looked. */
  contacted?: boolean;
  /** True once an outbound text is logged. */
  texted?: boolean;
  /** True when a visit is still on the calendar. */
  hasAppointment?: boolean;
  /** True when a visit already happened or site photos are on the job. */
  inspected?: boolean;
  hasDraft?: boolean;
  hasSent?: boolean;
  hasSigned?: boolean;
  /** An insurance claim exists and the carrier has not approved, closed, or denied it. */
  claimOpen?: boolean;
  firstName?: string;
  address?: string;
  code?: string;
};

const RELEASED_CLAIM = new Set(["approved", "depreciation", "closed", "denied"]);
const EARLY: readonly NextStepId[] = ["call", "text", "schedule"];
const SALES: readonly NextStepId[] = ["call", "text", "schedule", "estimate", "send", "supplement", "follow_up", "sold"];

type Gate = "open" | "done" | "skip" | "wait";

function booked(facts: NextStepFacts) {
  return facts.stage === "awarded" || (facts.contractValue ?? 0) > 0;
}

/** A draft, a sent proposal, or a visit already on file means the intro steps happened. */
function started(facts: NextStepFacts) {
  return Boolean(facts.hasDraft || facts.hasSent || facts.hasSigned || facts.inspected);
}

function person(facts: NextStepFacts) {
  return facts.firstName?.trim() || "them";
}

function salesGate(id: NextStepId, facts: NextStepFacts): Gate {
  switch (id) {
    case "call":
      if (facts.contacted === true || started(facts)) return "done";
      if (facts.contacted === false) return "open";
      return "skip";
    case "text":
      if (facts.texted === true || started(facts)) return "done";
      if (facts.texted === false) return "open";
      return "skip";
    case "schedule":
      if (facts.hasAppointment === true || started(facts)) return "done";
      if (facts.hasAppointment === false) return "open";
      return "skip";
    case "estimate":
      if (facts.hasDraft || facts.hasSent || facts.hasSigned) return "done";
      if (facts.hasAppointment === false && facts.inspected !== true) return "wait";
      if (facts.hasDraft === false || facts.hasSent === false || facts.hasSigned === false) return "open";
      return "skip";
    case "send":
      if (facts.hasSent || facts.hasSigned) return "done";
      if (facts.hasDraft) return "open";
      if (facts.hasDraft === false) return "wait";
      return "skip";
    case "supplement":
      if (facts.claimOpen !== true) return "skip";
      if (facts.hasSigned) return "done";
      if (facts.hasSent || facts.stage === "supplementing" || facts.stage === "estimating") return "open";
      return "wait";
    case "follow_up":
      if (facts.hasSigned) return "done";
      if (facts.hasSent) return "open";
      if (facts.hasSent === false) return "wait";
      return "skip";
    case "sold":
      if (booked(facts)) return "done";
      if (facts.hasSigned) return "open";
      if (facts.hasSigned === false) return "wait";
      return "skip";
    default:
      return "skip";
  }
}

function make(id: NextStepId, facts: NextStepFacts): NextStep {
  const who = person(facts);
  const place = facts.address?.trim() || "";
  const code = facts.code?.trim() || "";
  const on = code ? ` on ${code}` : "";
  switch (id) {
    case "call":
      return {
        id,
        title: who === "them" ? "Call back within 5 minutes" : `Call ${who} back within 5 minutes`,
        action: "Call",
        column: null,
        stage: null,
        detail: "No call logged yet",
        prompt: `Call ${who} back within 5 minutes${place ? ` about ${place}` : ""}${on}`,
      };
    case "text":
      return {
        id,
        title: `Text ${who} that we got the request`,
        action: "Text",
        column: null,
        stage: null,
        detail: "They have not heard from us",
        prompt: `Text ${who} that we got the request${code ? ` about ${code}` : ""}`,
      };
    case "schedule":
      return {
        id,
        title: "Schedule a roof inspection",
        action: "Schedule inspection",
        column: null,
        stage: null,
        detail: "No inspection on the calendar",
        prompt: `Schedule a roof inspection${place ? ` at ${place}` : ""} for ${who}${on}`,
      };
    case "estimate":
      return {
        id,
        title: "Draft a reroof estimate from the price book",
        action: "Draft estimate",
        column: null,
        stage: null,
        detail: "Inspection is set. No estimate yet",
        prompt: `Draft a reroof estimate from the price book${on}`,
      };
    case "send":
      return {
        id,
        title: "Send the proposal",
        action: "Send proposal",
        column: null,
        stage: null,
        detail: "Draft is ready to send",
        prompt: `Send the proposal${on}`,
      };
    case "supplement": {
      const already = facts.stage === "supplementing" || facts.stage === "estimating";
      return {
        id,
        title: "Supplement the claim",
        action: already ? "Follow up" : "Supplement",
        column: already ? null : "supplementing",
        stage: null,
        detail: already ? "Waiting on the carrier" : "Carrier has not released the claim",
        prompt: `Supplement the claim${on}`,
      };
    }
    case "follow_up":
      return {
        id,
        title: "Follow up on the proposal",
        action: "Follow up",
        column: null,
        stage: null,
        detail: "Proposal is out",
        prompt: `Follow up on the proposal${code ? ` for ${code}` : ""}`,
      };
    case "sold":
      return {
        id,
        title: "Mark the job sold",
        action: "Mark sold",
        column: null,
        stage: "awarded",
        detail: "Proposal is signed",
        prompt: `Mark ${code || "the job"} sold`,
      };
    case "production":
      return {
        id,
        title: "Start production",
        action: "Start production",
        column: "in_progress",
        stage: null,
        detail: "Sold. Ready for the crew",
        prompt: `Start production${on}`,
      };
    case "punch":
      return {
        id,
        title: "Start punch",
        action: "Start punch",
        column: "punch",
        stage: null,
        detail: "Production is underway",
        prompt: `Start the punch list${on}`,
      };
    case "closeout":
      return {
        id,
        title: "Close out",
        action: "Close out",
        column: "complete",
        stage: null,
        detail: "Punch is the last open work",
        prompt: `Close out${code ? ` ${code}` : " the job"}`,
      };
    case "warranty":
      return {
        id,
        title: "Warranty",
        action: "",
        column: null,
        stage: null,
        detail: "Job is complete",
        prompt: "",
      };
    case "resume":
      return {
        id,
        title: "Resume the job",
        action: "Resume",
        column: "in_progress",
        stage: null,
        detail: "On hold",
        prompt: `Resume${code ? ` ${code}` : " the job"}`,
      };
  }
}

/** The one move that should happen next. Null when the job is lost, unqualified, or already done with no action. */
export function nextStepFor(facts: NextStepFacts): NextStep | null {
  if (isShelvedStage(facts.stage)) return null;
  if (facts.status === "on_hold") return make("resume", facts);
  if (facts.status === "complete") return make("warranty", facts);
  if (facts.status === "punch") return make("closeout", facts);
  if (facts.status === "in_progress") return make("punch", facts);
  if (booked(facts)) return make("production", facts);
  for (const id of SALES) {
    const gate = salesGate(id, facts);
    if (gate === "open") return make(id, facts);
    if (gate === "wait") return null;
  }
  if (facts.status === "precon" || !facts.status) return make("schedule", facts);
  return null;
}

/**
 * Steps that can happen now. A new lead gets the call, the text, and the inspection
 * together. The estimate stays off the list until a visit is on the calendar.
 */
export function openNextSteps(facts: NextStepFacts): NextStep[] {
  const step = nextStepFor(facts);
  if (!step) return [];
  if (!EARLY.includes(step.id)) return [step];
  const early = EARLY.filter((id) => salesGate(id, facts) === "open").map((id) => make(id, facts));
  return early.length ? early : [step];
}

const SENT: ReadonlySet<EstimateStatus> = new Set(["sent", "viewed", "accepted"]);

function onRecord(
  row: { jobId?: string | null; opportunityId?: string | null },
  jobId: string | null,
  opportunityId: string | null,
) {
  if (jobId && row.jobId === jobId) return true;
  if (opportunityId && row.opportunityId === opportunityId) return true;
  return false;
}

function signedEstimate(estimate: { status: EstimateStatus; signatureImage?: string | null; secondSignatureImage?: string | null }) {
  return (
    estimate.status === "accepted" ||
    hasEstimateSignature(estimate) ||
    hasEstimateSignature({ signatureImage: estimate.secondSignatureImage })
  );
}

/** Facts for one job or lead, from the records already on the book. */
export function readNextStepFacts(input: {
  job?: { id: string; status: JobStatus; contractValue?: number; opportunityId?: string | null; code?: string } | null;
  opportunity?: { id: string; stage: PipelineStage; nextStep?: string; code?: string } | null;
  estimates?: Array<{
    jobId: string | null;
    opportunityId: string | null;
    status: EstimateStatus;
    archivedAt?: string | null;
    signatureImage?: string | null;
    secondSignatureImage?: string | null;
  }>;
  events?: Array<{ jobId: string | null; opportunityId: string | null; startsAt: string }>;
  messages?: Array<{ jobId: string | null; opportunityId: string | null; direction: string }>;
  activities?: Array<{ entityType: string; entityId: string; type: string }>;
  claimStatus?: string | null;
  photoCount?: number;
  firstName?: string;
  address?: string;
  now?: Date;
}): NextStepFacts {
  const jobId = input.job?.id ?? null;
  const opportunityId = input.opportunity?.id ?? input.job?.opportunityId ?? null;
  const now = input.now ?? new Date();
  const cutoff = now.getTime() - 60_000;
  const events = (input.events ?? []).filter((event) => onRecord(event, jobId, opportunityId));
  const hasAppointment = events.some((event) => new Date(event.startsAt).getTime() >= cutoff);
  const visited = events.some((event) => new Date(event.startsAt).getTime() < cutoff);
  const live = (input.estimates ?? []).filter(
    (estimate) => onRecord(estimate, jobId, opportunityId) && !estimate.archivedAt && estimate.status !== "declined",
  );
  const texts = (input.messages ?? []).some(
    (message) => message.direction === "outbound" && onRecord(message, jobId, opportunityId),
  );
  const activityOnJob = (input.activities ?? []).filter((activity) => {
    if (jobId && activity.entityType === "job" && activity.entityId === jobId) return true;
    if (opportunityId && activity.entityType === "opportunity" && activity.entityId === opportunityId) return true;
    return false;
  });
  const claim = input.claimStatus?.trim() || "";
  return {
    status: input.job?.status ?? null,
    stage: input.opportunity?.stage ?? null,
    contractValue: input.job?.contractValue ?? 0,
    contacted: activityOnJob.some((activity) => activity.type === "call"),
    texted: texts || activityOnJob.some((activity) => activity.type === "text"),
    hasAppointment,
    inspected: visited || (input.photoCount ?? 0) > 0,
    hasDraft: live.some((estimate) => estimate.status === "draft"),
    hasSent: live.some((estimate) => SENT.has(estimate.status) || signedEstimate(estimate)),
    hasSigned: live.some((estimate) => signedEstimate(estimate)),
    claimOpen: Boolean(claim) && !RELEASED_CLAIM.has(claim),
    firstName: input.firstName,
    address: input.address,
    code: input.job?.code || input.opportunity?.code || "",
  };
}
