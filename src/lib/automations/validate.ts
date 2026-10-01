import { looksLikePhone } from "@/lib/phone";
import { canonicalizeWorkColumn } from "@/lib/work-board";
import { unknownAutomationMergeFields } from "@/lib/automations/merge";
import { actionSteps, mainSteps, workflowActionList, workflowOf } from "@/lib/automations/workflow";
import {
  AUTOMATION_ACTIONS,
  AUTOMATION_CONDITION_FIELDS,
  AUTOMATION_OPERATORS,
  AUTOMATION_TRIGGERS,
  type Automation,
  type AutomationAction,
  type AutomationCondition,
  type AutomationTriggerConfig,
  type AutomationTriggerKind,
  type WorkflowStep,
  type WorkflowWaitUnit,
} from "@/lib/automations/types";

export type AutomationValidation = {
  ok: boolean;
  errors: string[];
  fieldErrors: Record<string, string>;
};

export function isCustomerFacingAction(action: AutomationAction) {
  if (action.kind !== "send_sms" && action.kind !== "send_email") return false;
  const to = action.to ?? "customer";
  return to === "customer" || to === "phone" || to === "email";
}

export function automationNeedsSmsNumber(actions: AutomationAction[]) {
  return actions.some((action) => action.kind === "send_sms" || action.kind === "notify_staff");
}

export function defaultRequiresConfirmation(actions: AutomationAction[]) {
  return actions.some(isCustomerFacingAction);
}

export function validateAutomationDraft(
  draft: Pick<Automation, "name" | "triggerKind" | "triggerConfig" | "conditions" | "actions">,
  options: { smsConfigured?: boolean } = {},
): AutomationValidation {
  const errors: string[] = [];
  const fieldErrors: Record<string, string> = {};

  if (!draft.name.trim()) {
    fieldErrors.name = "Name this automation.";
    errors.push(fieldErrors.name);
  }
  if (!AUTOMATION_TRIGGERS.includes(draft.triggerKind)) {
    fieldErrors.trigger = "Pick a trigger.";
    errors.push(fieldErrors.trigger);
  } else {
    const triggerError = validateTriggerConfig(draft.triggerKind, draft.triggerConfig);
    if (triggerError) {
      fieldErrors.trigger = triggerError;
      errors.push(triggerError);
    }
  }

  const workflow = workflowOf(draft.triggerConfig);
  const sourced = Boolean(workflow && workflow.steps.length > 0);
  const opening = workflow ? actionSteps(mainSteps(workflow, draft.actions)) : draft.actions;
  if (opening.length === 0) {
    fieldErrors.actions = workflow?.reply ? "Add the text they will reply to." : "Add at least one action.";
    errors.push(fieldErrors.actions);
  }
  if (workflow) {
    if (sourced) noteStepErrors(workflow.steps, "flow.main", fieldErrors, errors);
    const reply = workflow.reply;
    if (reply) {
      const waitError = validateWait(reply.amount, reply.unit);
      if (waitError) {
        fieldErrors.workflow = waitError;
        errors.push(waitError);
      }
      const branches = [
        ["yes", reply.yes],
        ["no", reply.no],
        ["timeout", reply.timeout],
      ] as const;
      if (branches.every(([, steps]) => steps.length === 0)) {
        fieldErrors.workflow = "Add what happens for yes, no, or no reply.";
        errors.push(fieldErrors.workflow);
      }
      for (const [branch, steps] of branches) noteStepErrors(steps, `flow.${branch}`, fieldErrors, errors);
    }
  }

  draft.conditions.forEach((condition, index) => {
    const error = validateCondition(condition);
    if (error) {
      fieldErrors[`condition.${index}`] = error;
      errors.push(error);
    }
  });

  if (!sourced) {
    draft.actions.forEach((action, index) => noteActionError(action, `action.${index}`, fieldErrors, errors));
  }

  const smsActions = workflow ? workflowActionList(workflow, draft.actions) : draft.actions;
  if (automationNeedsSmsNumber(smsActions) && options.smsConfigured === false) {
    fieldErrors.sms = "Add this office's Photon project under Settings → Photon before saving a text action.";
    errors.push(fieldErrors.sms);
  }

  return { ok: errors.length === 0, errors, fieldErrors };
}

function noteStepErrors(
  steps: WorkflowStep[],
  prefix: string,
  fieldErrors: Record<string, string>,
  errors: string[],
) {
  steps.forEach((step, index) => {
    if (step.kind === "wait") {
      const waitError = validateWait(step.amount, step.unit);
      if (waitError) {
        fieldErrors[`${prefix}.${index}`] = waitError;
        errors.push(waitError);
      }
      return;
    }
    noteActionError(step.action, `${prefix}.${index}`, fieldErrors, errors);
  });
}

function noteActionError(
  action: AutomationAction,
  key: string,
  fieldErrors: Record<string, string>,
  errors: string[],
) {
  const error = validateAction(action);
  if (error) {
    fieldErrors[key] = error;
    errors.push(error);
  }
  const unknown = [
    ...unknownAutomationMergeFields(action.body ?? ""),
    ...unknownAutomationMergeFields(action.subject ?? ""),
    ...unknownAutomationMergeFields(action.title ?? ""),
  ];
  if (unknown.length > 0) {
    const message = `Unknown merge field {{${unknown[0]}}}.`;
    fieldErrors[`${key}.merge`] = message;
    errors.push(message);
  }
}

function validateWait(amount: number, unit: WorkflowWaitUnit) {
  const n = Number(amount);
  const max = unit === "minutes" ? 43200 : unit === "days" ? 30 : 720;
  if (!Number.isFinite(n) || n < 1 || n > max) {
    return `Wait between 1 and ${max} ${unit}.`;
  }
  return "";
}

export function validateTriggerConfig(kind: AutomationTriggerKind, config: AutomationTriggerConfig) {
  if (kind === "job_stage_changed" || kind === "job_stage_after_days") {
    const stage = canonicalizeWorkColumn(String(config.stage ?? ""));
    if (!stage || stage === "deleted") {
      return "Pick a stage.";
    }
  }
  if (
    kind === "job_stage_after_days" ||
    kind === "lead_created_after_days" ||
    kind === "estimate_sent_after_days" ||
    kind === "event_in_days"
  ) {
    const days = Number(config.days);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      return "Enter a day count between 1 and 365.";
    }
  }
  return "";
}

function validateCondition(condition: AutomationCondition) {
  if (!AUTOMATION_CONDITION_FIELDS.includes(condition.field)) return "Pick a field.";
  if (!AUTOMATION_OPERATORS.includes(condition.operator)) return "Pick an operator.";
  if (condition.operator === "eq" || condition.operator === "neq" || condition.operator === "contains") {
    if (!condition.value.trim()) return "Enter a value.";
  }
  return "";
}

function validateAction(action: AutomationAction) {
  if (!AUTOMATION_ACTIONS.includes(action.kind)) return "Pick an action.";
  if (action.kind === "send_sms" || action.kind === "notify_staff") {
    if (!action.body?.trim()) return "Write the text.";
  }
  if (action.kind === "send_email") {
    if (!action.subject?.trim()) return "Add an email subject.";
    if (!action.body?.trim()) return "Write the email.";
  }
  if (action.kind === "create_task" && !action.title?.trim()) return "Name the task.";
  if (action.kind === "add_note" && !action.body?.trim()) return "Write the note.";
  if (action.kind === "set_job_value") {
    const mode = action.valueMode ?? "estimate";
    if (mode === "amount") {
      const amount = Number(action.amount);
      if (!Number.isFinite(amount) || amount < 0) return "Enter a job value of zero or more.";
    }
  }
  if (action.kind === "set_job_stage") {
    const stage = canonicalizeWorkColumn(String(action.stage ?? ""));
    if (!stage || stage === "deleted") return "Pick a stage.";
  }
  if (action.kind === "webhook") {
    try {
      const url = new URL(action.url ?? "");
      if (url.protocol !== "https:" && url.protocol !== "http:") return "Enter an http(s) webhook URL.";
    } catch {
      return "Enter a webhook URL.";
    }
  }
  if (action.to === "staff" && !action.staffId) return "Pick who receives this.";
  if (action.to === "phone" && !looksLikePhone(action.phone ?? "")) return "Enter a mobile number.";
  if (action.to === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((action.email ?? "").trim())) {
    return "Enter an email address.";
  }
  return "";
}
