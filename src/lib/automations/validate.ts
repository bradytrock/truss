import { isWorkColumn } from "@/lib/work-board";
import { unknownAutomationMergeFields } from "@/lib/automations/merge";
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
} from "@/lib/automations/types";

export type AutomationValidation = {
  ok: boolean;
  errors: string[];
  fieldErrors: Record<string, string>;
};

export function isCustomerFacingAction(action: AutomationAction) {
  return (
    (action.kind === "send_sms" || action.kind === "send_email") &&
    (action.to ?? "customer") === "customer"
  );
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

  if (draft.actions.length === 0) {
    fieldErrors.actions = "Add at least one action.";
    errors.push(fieldErrors.actions);
  }

  draft.conditions.forEach((condition, index) => {
    const error = validateCondition(condition);
    if (error) {
      fieldErrors[`condition.${index}`] = error;
      errors.push(error);
    }
  });

  draft.actions.forEach((action, index) => {
    const error = validateAction(action);
    if (error) {
      fieldErrors[`action.${index}`] = error;
      errors.push(error);
    }
    const unknown = [
      ...unknownAutomationMergeFields(action.body ?? ""),
      ...unknownAutomationMergeFields(action.subject ?? ""),
      ...unknownAutomationMergeFields(action.title ?? ""),
    ];
    if (unknown.length > 0) {
      const message = `Unknown merge field {{${unknown[0]}}}.`;
      fieldErrors[`action.${index}.merge`] = message;
      errors.push(message);
    }
  });

  if (automationNeedsSmsNumber(draft.actions) && options.smsConfigured === false) {
    fieldErrors.sms = "Connect myCRMSIM under Settings → Texts before saving a text action.";
    errors.push(fieldErrors.sms);
  }

  return { ok: errors.length === 0, errors, fieldErrors };
}

export function validateTriggerConfig(kind: AutomationTriggerKind, config: AutomationTriggerConfig) {
  if (kind === "job_stage_changed" || kind === "job_stage_after_days") {
    if (!config.stage || !isWorkColumn(config.stage) || config.stage === "deleted") {
      return "Pick a stage.";
    }
  }
  if (kind === "job_stage_after_days" || kind === "estimate_sent_after_days" || kind === "event_in_days") {
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
  if (action.kind === "webhook") {
    try {
      const url = new URL(action.url ?? "");
      if (url.protocol !== "https:" && url.protocol !== "http:") return "Enter an http(s) webhook URL.";
    } catch {
      return "Enter a webhook URL.";
    }
  }
  if ((action.to === "staff" || action.kind === "notify_staff") && action.to === "staff" && !action.staffId) {
    return "Pick who to notify.";
  }
  return "";
}
