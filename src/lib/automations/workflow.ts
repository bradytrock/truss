import type { AutomationTriggerConfig, AutomationWorkflow } from "@/lib/automations/types";

const YES_WORDS = new Set([
  "yes",
  "y",
  "yeah",
  "yep",
  "yup",
  "sure",
  "ok",
  "okay",
  "confirm",
  "confirmed",
  "absolutely",
  "definitely",
]);

const NO_WORDS = new Set([
  "no",
  "n",
  "nope",
  "nah",
  "stop",
  "cancel",
  "decline",
  "declined",
]);

export function workflowOf(config: Pick<AutomationTriggerConfig, "workflow"> | null | undefined) {
  const workflow = config?.workflow;
  if (!workflow?.enabled) return null;
  return workflow;
}

export function replyDeadline(hours: number, from = new Date()) {
  const next = new Date(from.getTime());
  next.setTime(next.getTime() + Math.max(1, Math.round(hours)) * 60 * 60 * 1000);
  return next.toISOString();
}

/** A homeowner text is yes, no, or not a clear answer. */
export function classifyAutomationReply(body: string): "yes" | "no" | null {
  const text = body
    .trim()
    .toLowerCase()
    .replace(/[!.,?'"]+$/g, "")
    .replace(/\s+/g, " ");
  if (!text) return null;
  if (text === "not now" || text === "not interested" || text.startsWith("not interested")) return "no";
  if (YES_WORDS.has(text) || NO_WORDS.has(text)) return YES_WORDS.has(text) ? "yes" : "no";
  const first = text.split(" ")[0] ?? "";
  if (YES_WORDS.has(first)) return "yes";
  if (NO_WORDS.has(first)) return "no";
  return null;
}

export function workflowBranchActions(workflow: AutomationWorkflow, branch: "yes" | "no" | "timeout") {
  if (branch === "yes") return workflow.yes;
  if (branch === "no") return workflow.no;
  return workflow.timeout;
}
