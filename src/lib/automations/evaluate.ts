import type { Contact, Job, Opportunity, StaffMember } from "@/lib/types";
import { workColumnFor, type WorkColumn } from "@/lib/work-board";
import {
  type Automation,
  type AutomationCondition,
  type AutomationEvent,
  type AutomationTriggerKind,
} from "@/lib/automations/types";

export function automationMatchesEvent(automation: Automation, event: AutomationEvent) {
  if (!automation.enabled) return false;
  switch (automation.triggerKind) {
    case "job_created":
      return event.kind === "job_created";
    case "job_stage_changed":
      return event.kind === "job_stage_changed" && event.stage === automation.triggerConfig.stage;
    case "job_stage_after_days":
      return event.kind === "job_stage_changed" && event.stage === automation.triggerConfig.stage;
    case "invoice_paid":
      return event.kind === "invoice_paid";
    case "estimate_sent_after_days":
      return event.kind === "estimate_sent";
    case "event_in_days":
      return false;
    default:
      return false;
  }
}

export function automationIsDelayed(kind: AutomationTriggerKind) {
  return (
    kind === "job_stage_after_days" ||
    kind === "estimate_sent_after_days" ||
    kind === "event_in_days"
  );
}

export function scheduledForFromTrigger(kind: AutomationTriggerKind, days: number, from = new Date()) {
  const next = new Date(from.getTime());
  if (kind === "event_in_days") {
    next.setDate(next.getDate() + Math.max(0, days));
    return next.toISOString();
  }
  next.setDate(next.getDate() + Math.max(1, days));
  return next.toISOString();
}

export function conditionsPass(
  conditions: AutomationCondition[],
  input: {
    job?: Job | null;
    opportunity?: Opportunity | null;
    contact?: Contact | null;
    customerName?: string;
    owner?: Pick<StaffMember, "id"> | null;
    stage?: WorkColumn | "";
  },
) {
  if (conditions.length === 0) return true;
  return conditions.every((condition) => conditionPasses(condition, input));
}

function conditionPasses(
  condition: AutomationCondition,
  input: {
    job?: Job | null;
    opportunity?: Opportunity | null;
    contact?: Contact | null;
    customerName?: string;
    owner?: Pick<StaffMember, "id"> | null;
    stage?: WorkColumn | "";
  },
) {
  const actual = conditionValue(condition.field, input);
  if (condition.operator === "is_set") return actual.trim().length > 0;
  if (condition.operator === "is_empty") return actual.trim().length === 0;
  const expected = condition.value.trim();
  if (condition.operator === "contains") {
    return actual.toLowerCase().includes(expected.toLowerCase());
  }
  const equal = actual.toLowerCase() === expected.toLowerCase();
  return condition.operator === "eq" ? equal : !equal;
}

function conditionValue(
  field: AutomationCondition["field"],
  input: {
    job?: Job | null;
    opportunity?: Opportunity | null;
    contact?: Contact | null;
    customerName?: string;
    owner?: Pick<StaffMember, "id"> | null;
    stage?: WorkColumn | "";
  },
) {
  const job = input.job;
  switch (field) {
    case "job.stage":
      return String(input.stage || (job ? workColumnFor(job, input.opportunity) : ""));
    case "job.status":
      return job?.status ?? "";
    case "job.city":
      return job?.city ?? "";
    case "job.state":
      return job?.state ?? "";
    case "job.projectType":
      return job?.projectType ?? "";
    case "job.market":
      return job?.market ?? "";
    case "customer.name":
      return input.customerName ?? input.contact?.name ?? "";
    case "contact.email":
      return input.contact?.email ?? "";
    case "rep.id":
      return input.owner?.id ?? job?.ownerStaffId ?? "";
    default:
      return "";
  }
}
