import assert from "node:assert/strict";
import { conditionsPass, automationMatchesEvent, scheduledForFromTrigger } from "./evaluate.ts";
import { applyAutomationMerge, smsSegmentCount, unknownAutomationMergeFields } from "./merge.ts";
import { plannedRunsForEvent } from "./queue.ts";
import { summarizeAutomation, summarizeTrigger } from "./summarize.ts";
import { defaultRequiresConfirmation, validateAutomationDraft } from "./validate.ts";
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
  }),
  "Hi Pat",
);
assert.equal(smsSegmentCount("x".repeat(160)).segments, 1);
assert.equal(smsSegmentCount("x".repeat(161)).segments, 2);

assert.equal(summarizeTrigger("job_created", {}), "When a job is created");
assert.equal(
  summarizeTrigger("job_stage_changed", { stage: "complete" }),
  "When a job moves to Complete",
);
assert.match(summarizeAutomation({ ...automation, actions: [sms] }), /invoice is paid → Send text/);

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

console.log("automations.test.ts ok");
