import { describeJobValue } from "@/lib/automations/job-effects";
import { WORK_COLUMN_LABELS, canonicalizeWorkColumn, isWorkColumn } from "@/lib/work-board";
import {
  AUTOMATION_ACTION_LABELS,
  AUTOMATION_CONDITION_FIELD_LABELS,
  AUTOMATION_OPERATOR_LABELS,
  AUTOMATION_TRIGGER_LABELS,
  type Automation,
  type AutomationAction,
  type AutomationCondition,
  type AutomationTriggerKind,
} from "@/lib/automations/types";

export function stageDisplayName(stage: string | undefined, labels: Record<string, string> = WORK_COLUMN_LABELS) {
  if (!stage) return "a stage";
  const canonical = canonicalizeWorkColumn(stage) ?? stage;
  return labels[canonical] || (isWorkColumn(canonical) ? WORK_COLUMN_LABELS[canonical] : canonical);
}

export function summarizeTrigger(
  kind: AutomationTriggerKind,
  config: Automation["triggerConfig"],
  labels?: Record<string, string>,
) {
  const stage = stageDisplayName(config.stage, labels);
  const days = Number(config.days) || 0;
  switch (kind) {
    case "job_created":
      return "When a job is created";
    case "job_stage_changed":
      return `When a job moves to ${stage}`;
    case "job_stage_after_days":
      return `When ${days} day${days === 1 ? "" : "s"} after a job enters ${stage}`;
    case "invoice_paid":
      return "When an invoice is paid";
    case "estimate_sent":
      return "When a proposal is sent";
    case "estimate_sent_after_days":
      return `When ${days} day${days === 1 ? "" : "s"} after a proposal is sent`;
    case "estimate_won":
      return "When a proposal is won";
    case "estimate_lost":
      return "When a proposal is lost";
    case "event_in_days":
      return `When ${days} day${days === 1 ? "" : "s"} before a calendar event`;
    default:
      return AUTOMATION_TRIGGER_LABELS[kind] ?? "When something happens";
  }
}

export function summarizeAction(action: AutomationAction) {
  switch (action.kind) {
    case "set_job_value":
      return describeJobValue(action, null).replace(/ \(.*\)$/, "");
    case "set_job_stage":
      return `Move the job to ${stageDisplayName(action.stage)}`;
    case "add_note":
      return "Add a job note";
    case "send_sms":
      return `Text ${recipientLabel(action)}`;
    case "send_email":
      return `Email ${recipientLabel(action)}`;
    case "notify_staff":
      return action.to === "staff" ? "Text a teammate" : "Text the job owner";
    default:
      return AUTOMATION_ACTION_LABELS[action.kind] ?? action.kind;
  }
}

function recipientLabel(action: AutomationAction) {
  switch (action.to) {
    case "rep":
      return "the job owner";
    case "staff":
      return "a teammate";
    case "phone":
      return "a phone number";
    case "email":
      return "an email address";
    default:
      return "the customer";
  }
}

export function summarizeAutomation(
  automation: Pick<Automation, "triggerKind" | "triggerConfig" | "actions">,
  labels?: Record<string, string>,
) {
  const trigger = summarizeTrigger(automation.triggerKind, automation.triggerConfig, labels);
  const first = automation.actions[0] ? summarizeAction(automation.actions[0]) : "do nothing";
  const extra = automation.actions.length > 1 ? ` + ${automation.actions.length - 1} more` : "";
  return `${trigger} → ${first}${extra}`;
}

export function summarizeCondition(condition: AutomationCondition, labels?: Record<string, string>) {
  const field = AUTOMATION_CONDITION_FIELD_LABELS[condition.field] ?? condition.field;
  const operator = AUTOMATION_OPERATOR_LABELS[condition.operator] ?? condition.operator;
  if (condition.operator === "is_set" || condition.operator === "is_empty") {
    return `${field} ${operator}`;
  }
  const value =
    condition.field === "job.stage" ? stageDisplayName(condition.value, labels) : condition.value;
  return `${field} ${operator} ${value}`;
}
