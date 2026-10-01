import assert from "node:assert/strict";
import { automationEmailText } from "./execute.ts";
import { conditionsPass, automationMatchesEvent, scheduledForFromTrigger } from "./evaluate.ts";
import { applyAutomationMerge, smsSegmentCount, unknownAutomationMergeFields } from "./merge.ts";
import { plannedRunsForEvent, previewAutomation } from "./queue.ts";
import { summarizeAutomation, summarizeTrigger, summarizeWorkflowBranch } from "./summarize.ts";
import { defaultRequiresConfirmation, validateAutomationDraft } from "./validate.ts";
import { classifyAutomationReply, replyDeadline } from "./workflow.ts";
import type { Automation, AutomationAction, AutomationCondition } from "./types.ts";

const sms: AutomationAction = {
  id: "a1",
  kind: "send_sms",
  to: "customer",
  body: "Hi {{contactName}}, thanks for hiring {{companyName}}.",
};

const automation: Pick<Automation, "name" | "triggerKind" | "triggerConfig" | "conditions" | "actions"> = {
  name: "Thank you",
  triggerKind: "invoice_paid",
  triggerConfig: {},
  conditions: [],
  actions: [sms],
};

assert.equal(validateAutomationDraft(automation, { smsConfigured: true }).ok, true);
assert.equal(validateAutomationDraft({ ...automation, actions: [] }).ok, false);
assert.equal(
  validateAutomationDraft({
    ...automation,
    triggerKind: "job_stage_changed",
    triggerConfig: {},
  }).ok,
  false,
);
assert.match(
  validateAutomationDraft({
    ...automation,
    actions: [{ ...sms, body: "Hi {{unknownField}}" }],
  }).fieldErrors["action.0.merge"] ?? "",
  /Unknown merge field/,
);
assert.equal(validateAutomationDraft(automation, { smsConfigured: false }).ok, false);
assert.equal(defaultRequiresConfirmation([sms]), true);
assert.equal(defaultRequiresConfirmation([{ id: "t", kind: "create_task", title: "Call" }]), false);

assert.deepEqual(unknownAutomationMergeFields("Hi {{contactName}} {{nope}}"), ["nope"]);
assert.equal(
  applyAutomationMerge("Hi {{contactName}}", {
    companyName: "Truss",
    companyPhone: "",
    staffName: "",
    staffPhone: "",
    jobName: "",
    jobCode: "",
    jobAddress: "",
    jobCity: "",
    jobStage: "",
    contactName: "Pat",
    contactPhone: "",
    contactEmail: "",
    reviewUrl: "",
    jobValue: "",
    estimateTotal: "",
  }),
  "Hi Pat",
);
assert.equal(smsSegmentCount("x".repeat(160)).segments, 1);
assert.equal(smsSegmentCount("x".repeat(161)).segments, 2);

assert.equal(summarizeTrigger("job_created", {}), "When a job is created");
assert.equal(summarizeTrigger("lead_created", {}), "When a new lead is created");
assert.equal(summarizeTrigger("lead_assigned", {}), "When a lead is assigned");
assert.equal(summarizeTrigger("appointment_scheduled", {}), "When an appointment is scheduled");
assert.equal(summarizeTrigger("invoice_sent", {}), "When an invoice is sent");
assert.equal(summarizeTrigger("lead_created_after_days", { days: 1 }), "When 1 day after a new lead is created");
assert.equal(
  summarizeTrigger("job_stage_changed", { stage: "complete" }),
  "When a job moves to Complete",
);
assert.match(summarizeAutomation({ ...automation, actions: [sms] }), /invoice is paid → Text the customer/);

assert.equal(
  automationMatchesEvent(
    { ...automation, enabled: true, triggerKind: "job_stage_changed", triggerConfig: { stage: "lost" } } as Automation,
    { kind: "job_stage_changed", stage: "lost" },
  ),
  true,
);
assert.equal(
  automationMatchesEvent(
    { ...automation, enabled: true, triggerKind: "job_stage_changed", triggerConfig: { stage: "lost" } } as Automation,
    { kind: "job_stage_changed", stage: "complete" },
  ),
  false,
);

const city: AutomationCondition = { id: "c1", field: "job.city", operator: "eq", value: "Dallas" };
assert.equal(conditionsPass([city], { job: { city: "Dallas" } as never }), true);
assert.equal(conditionsPass([city], { job: { city: "Austin" } as never }), false);

const when = scheduledForFromTrigger("job_stage_after_days", 3, new Date("2026-09-18T12:00:00.000Z"));
assert.ok(when.startsWith("2026-09-21"));

const rule = {
  id: "auto-1",
  companyId: "co-1",
  name: "Thank you",
  description: "",
  triggerKind: "invoice_paid",
  triggerConfig: {},
  conditions: [],
  actions: [sms],
  requiresConfirmation: true,
  oncePerJob: true,
  enabled: true,
  createdByStaffId: null,
  lastFiredAt: null,
  createdAt: "2026-09-18T12:00:00.000Z",
  updatedAt: "2026-09-18T12:00:00.000Z",
} satisfies Automation;

const book = {
  automations: [rule],
  automationRuns: [],
  jobs: [{ id: "j1", name: "Roof", code: "JOB-1", city: "Dallas", primaryContactId: "c1", ownerStaffId: "s1" }],
  contacts: [{ id: "c1", name: "Pat" }],
  staff: [{ id: "s1", name: "Sam" }],
  opportunities: [],
  googleLocations: [],
} as never;

const planned = plannedRunsForEvent({
  event: { kind: "invoice_paid", jobId: "j1" },
  book,
  company: { name: "Truss", phone: "555" } as never,
});
assert.equal(planned.length, 1);
assert.equal(planned[0]?.status, "pending_confirmation");
assert.match(planned[0]?.renderedPreview ?? "", /Pat/);

const delayed = plannedRunsForEvent({
  event: { kind: "job_stage_changed", jobId: "j1", stage: "complete" },
  book: {
    ...book,
    automations: [
      {
        ...rule,
        triggerKind: "job_stage_after_days",
        triggerConfig: { stage: "complete", days: 2 },
        requiresConfirmation: false,
      },
    ],
  } as never,
  company: { name: "Truss", phone: "555" } as never,
});
assert.equal(delayed[0]?.status, "scheduled");
assert.ok(delayed[0]?.scheduledFor);

const won = {
  ...rule,
  triggerKind: "estimate_won" as const,
  requiresConfirmation: false,
  actions: [{ id: "v1", kind: "set_job_value" as const, valueMode: "estimate" as const }],
};
assert.equal(validateAutomationDraft(won, { smsConfigured: false }).ok, true);
assert.equal(defaultRequiresConfirmation(won.actions), false);
assert.equal(
  validateAutomationDraft({
    ...won,
    actions: [{ id: "p1", kind: "send_sms", to: "phone", body: "Hi", phone: "555" }],
  }).ok,
  false,
);
assert.equal(
  automationMatchesEvent({ ...won, enabled: true } as Automation, { kind: "estimate_won", estimateId: "e1" }),
  true,
);
assert.equal(
  automationMatchesEvent({ ...won, enabled: true, triggerKind: "estimate_lost" } as Automation, {
    kind: "estimate_sent",
  }),
  false,
);
assert.match(summarizeTrigger("estimate_sent", {}), /proposal is sent/);
assert.match(summarizeTrigger("estimate_lost", {}), /proposal is lost/);

assert.equal(
  automationMatchesEvent({ ...rule, triggerKind: "lead_created" }, { kind: "lead_created", jobId: "j1" }),
  true,
);
assert.equal(
  automationMatchesEvent({ ...rule, triggerKind: "lead_created_after_days", triggerConfig: { days: 2 } }, {
    kind: "lead_created",
    jobId: "j1",
  }),
  true,
);
assert.equal(
  automationMatchesEvent({ ...rule, triggerKind: "job_created" }, { kind: "lead_created", jobId: "j1" }),
  false,
);
assert.equal(
  automationMatchesEvent({ ...rule, triggerKind: "lead_assigned" }, { kind: "lead_assigned", jobId: "j1" }),
  true,
);
assert.equal(
  automationMatchesEvent({ ...rule, triggerKind: "appointment_scheduled" }, {
    kind: "appointment_scheduled",
    jobId: "j1",
    eventId: "ev1",
  }),
  true,
);
assert.equal(
  automationMatchesEvent({ ...rule, triggerKind: "invoice_sent" }, { kind: "invoice_sent", invoiceId: "inv1" }),
  true,
);
assert.equal(
  validateAutomationDraft({
    ...automation,
    triggerKind: "lead_created_after_days",
    triggerConfig: { days: 0 },
    actions: [{ id: "t", kind: "create_task", title: "Call" }],
  }).ok,
  false,
);

const source: AutomationCondition = { id: "c2", field: "job.leadSource", operator: "eq", value: "website" };
assert.equal(conditionsPass([source], { job: { leadSource: "website" } as never }), true);
assert.equal(
  conditionsPass([source], { opportunity: { leadSource: "phone" } as never, job: { leadSource: "" } as never }),
  false,
);
assert.equal(conditionsPass([source], { opportunity: { leadSource: "website" } as never }), true);

const leadFollowUp = plannedRunsForEvent({
  event: { kind: "lead_created", jobId: "j1" },
  book: {
    ...book,
    automations: [
      {
        ...rule,
        triggerKind: "lead_created_after_days",
        triggerConfig: { days: 1 },
        requiresConfirmation: false,
        actions: [{ id: "t", kind: "create_task", title: "Call {{contactName}}" }],
      },
    ],
  } as never,
  company: { name: "Truss", phone: "555" } as never,
});
assert.equal(leadFollowUp[0]?.status, "scheduled");
assert.ok(leadFollowUp[0]?.scheduledFor);

const booked = plannedRunsForEvent({
  event: { kind: "appointment_scheduled", jobId: "j1", eventId: "ev1" },
  book: {
    ...book,
    automations: [{ ...rule, triggerKind: "appointment_scheduled", requiresConfirmation: true }],
  } as never,
  company: { name: "Truss", phone: "555" } as never,
});
assert.equal(booked[0]?.eventId, "ev1");
assert.equal(booked[0]?.status, "pending_confirmation");

const valued = plannedRunsForEvent({
  event: { kind: "estimate_won", jobId: "j1", estimateId: "e1" },
  book: { ...book, automations: [won] } as never,
  company: { name: "Truss", phone: "555" } as never,
});
assert.equal(valued.length, 1);
assert.equal(valued[0]?.status, "confirmed");
assert.match(valued[0]?.renderedPreview ?? "", /proposal total/);
assert.equal(automationEmailText("Status updated", "Moved to In progress"), "Status updated\n\nMoved to In progress");

assert.equal(classifyAutomationReply("Yes!"), "yes");
assert.equal(classifyAutomationReply("yeah we are interested"), "yes");
assert.equal(classifyAutomationReply("ok"), "yes");
assert.equal(classifyAutomationReply("No thanks"), "no");
assert.equal(classifyAutomationReply("not interested"), "no");
assert.equal(classifyAutomationReply("maybe later"), null);
assert.equal(classifyAutomationReply("  "), null);
assert.equal(replyDeadline(24, new Date("2026-09-18T12:00:00.000Z")), "2026-09-19T12:00:00.000Z");
assert.equal(replyDeadline(0, new Date("2026-09-18T12:00:00.000Z")), "2026-09-18T13:00:00.000Z");

const replyMap = {
  enabled: true as const,
  timeoutHours: 24,
  yes: [{ id: "y", kind: "create_task" as const, title: "Call {{contactName}}" }],
  no: [{ id: "n", kind: "add_note" as const, body: "{{contactName}} said no." }],
  timeout: [] as AutomationAction[],
};
const mapped = {
  ...automation,
  triggerKind: "lead_created" as const,
  triggerConfig: { workflow: replyMap },
  actions: [sms],
};
assert.equal(validateAutomationDraft(mapped, { smsConfigured: true }).ok, true);
assert.equal(validateAutomationDraft({ ...mapped, actions: [] }, { smsConfigured: true }).ok, false);
assert.equal(
  validateAutomationDraft(
    { ...mapped, triggerConfig: { workflow: { ...replyMap, timeoutHours: 0, yes: [], no: [], timeout: [] } } },
    { smsConfigured: true },
  ).ok,
  false,
);
assert.match(summarizeAutomation(mapped), /yes \/ no \/ no reply in 24 hours/);
assert.equal(summarizeWorkflowBranch("If no reply", []), "If no reply: Do nothing");

const previewJob = {
  id: "j1",
  name: "Roof",
  code: "JOB-1",
  city: "Dallas",
  primaryContactId: "c1",
  ownerStaffId: "s1",
};
const yesNoPreview = previewAutomation({
  automation: { ...rule, triggerKind: "lead_created", triggerConfig: { workflow: replyMap } },
  book: {
    jobs: [previewJob],
    contacts: [{ id: "c1", name: "Pat" }],
    staff: [{ id: "s1", name: "Sam" }],
    opportunities: [],
    googleLocations: [],
  } as never,
  company: { name: "Truss", phone: "555" } as never,
  job: previewJob as never,
});
assert.match(yesNoPreview, /If yes: Call Pat/);
assert.match(yesNoPreview, /If no: Pat said no/);
assert.match(yesNoPreview, /If no reply in 24 hours: Do nothing/);

const yesNoQueued = plannedRunsForEvent({
  event: { kind: "lead_created", jobId: "j1" },
  book: {
    ...book,
    automations: [
      {
        ...rule,
        triggerKind: "lead_created",
        triggerConfig: { workflow: replyMap },
        requiresConfirmation: false,
      },
    ],
  } as never,
  company: { name: "Truss", phone: "555" } as never,
});
assert.equal(yesNoQueued[0]?.status, "confirmed");
assert.match(yesNoQueued[0]?.renderedPreview ?? "", /If yes/);

console.log("automations.test.ts ok");
