import type {
  AutomationAction,
  AutomationTriggerConfig,
  AutomationWorkflow,
  WorkflowCursor,
  WorkflowLane,
  WorkflowReply,
  WorkflowStep,
  WorkflowWaitUnit,
} from "@/lib/automations/types";

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

export function formatWait(amount: number, unit: WorkflowWaitUnit) {
  const n = Math.max(1, Math.round(Number(amount) || 1));
  const label = n === 1 ? unit.slice(0, -1) : unit;
  return `Wait ${n} ${label}`;
}

export function formatDuration(amount: number, unit: WorkflowWaitUnit) {
  return formatWait(amount, unit).replace(/^Wait /, "");
}

export function waitDeadline(amount: number, unit: WorkflowWaitUnit, from = new Date()) {
  const n = Math.max(1, Math.round(Number(amount) || 1));
  const ms = unit === "minutes" ? n * 60_000 : unit === "days" ? n * 86_400_000 : n * 3_600_000;
  return new Date(from.getTime() + ms).toISOString();
}

export function replyDeadline(hours: number, from = new Date()) {
  return waitDeadline(hours, "hours", from);
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

export function actionSteps(steps: WorkflowStep[]) {
  return steps.flatMap((step) => (step.kind === "action" ? [step.action] : []));
}

/** Steps before the split. Older rules stored that sequence on the automation itself. */
export function mainSteps(workflow: AutomationWorkflow, opening: AutomationAction[]) {
  if (workflow.steps.length > 0) return workflow.steps;
  return opening.map((action) => ({ id: action.id, kind: "action" as const, action }));
}

export function laneSteps(workflow: AutomationWorkflow, opening: AutomationAction[], lane: WorkflowLane) {
  if (lane === "main") return mainSteps(workflow, opening);
  return workflow.reply?.[lane] ?? [];
}

export function workflowActionList(workflow: AutomationWorkflow, opening: AutomationAction[]) {
  const reply = workflow.reply;
  return [
    ...actionSteps(mainSteps(workflow, opening)),
    ...actionSteps(reply?.yes ?? []),
    ...actionSteps(reply?.no ?? []),
    ...actionSteps(reply?.timeout ?? []),
  ];
}

export function parseWorkflowCursor(raw: unknown): WorkflowCursor | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const lane = row.lane;
  const index = Number(row.index);
  if (lane !== "main" && lane !== "yes" && lane !== "no" && lane !== "timeout") return null;
  if (!Number.isInteger(index) || index < 0) return null;
  return { lane, index };
}

export type WorkflowHold =
  | { kind: "wait"; at: string; cursor: WorkflowCursor; delivery: string }
  | { kind: "reply"; at: string; cursor: WorkflowCursor; delivery: string }
  | { kind: "done" };

export type WorkflowPlan = {
  actions: AutomationAction[];
  hold: WorkflowHold;
};

/** Run every action up to the next wait, reply split, or end. */
export function planWorkflowSlice(input: {
  workflow: AutomationWorkflow;
  openingActions: AutomationAction[];
  cursor: WorkflowCursor | null;
  now?: Date;
}): WorkflowPlan {
  const now = input.now ?? new Date();
  const lane = input.cursor?.lane ?? "main";
  let index = input.cursor?.index ?? 0;
  const steps = laneSteps(input.workflow, input.openingActions, lane);
  const actions: AutomationAction[] = [];

  while (index < steps.length) {
    const step = steps[index];
    if (!step) break;
    if (step.kind === "wait") {
      return {
        actions,
        hold: {
          kind: "wait",
          at: waitDeadline(step.amount, step.unit, now),
          cursor: { lane, index: index + 1 },
          delivery: formatWait(step.amount, step.unit),
        },
      };
    }
    actions.push(step.action);
    index += 1;
  }

  const reply: WorkflowReply | undefined = lane === "main" ? input.workflow.reply : undefined;
  if (reply) {
    return {
      actions,
      hold: {
        kind: "reply",
        at: waitDeadline(reply.amount, reply.unit, now),
        cursor: { lane: "main", index },
        delivery: `Waiting on a reply for ${formatDuration(reply.amount, reply.unit)}.`,
      },
    };
  }

  return { actions, hold: { kind: "done" } };
}

export function settleWorkflow(
  plan: WorkflowPlan,
  executed: { ok: boolean; delivery: string; error: string },
  prefix = "",
) {
  const delivery = [prefix, executed.delivery, executed.ok && plan.hold.kind !== "done" ? plan.hold.delivery : ""]
    .filter(Boolean)
    .join(". ");
  if (!executed.ok) {
    return { status: "failed" as const, delivery, error: executed.error, scheduledFor: null, cursor: "" };
  }
  if (plan.hold.kind === "wait") {
    return {
      status: "scheduled" as const,
      delivery,
      error: "",
      scheduledFor: plan.hold.at,
      cursor: JSON.stringify(plan.hold.cursor),
    };
  }
  if (plan.hold.kind === "reply") {
    return {
      status: "waiting_reply" as const,
      delivery,
      error: "",
      scheduledFor: plan.hold.at,
      cursor: JSON.stringify(plan.hold.cursor),
    };
  }
  return { status: "sent" as const, delivery, error: "", scheduledFor: null, cursor: "" };
}
