import assert from "node:assert/strict";
import { nextStepFor, openNextSteps, readNextStepFacts, type NextStepFacts } from "./next-steps.ts";

const fresh: NextStepFacts = {
  status: "precon",
  stage: "pursuing",
  contractValue: 0,
  contacted: false,
  texted: false,
  hasAppointment: false,
  inspected: false,
  hasDraft: false,
  hasSent: false,
  hasSigned: false,
  claimOpen: false,
  firstName: "Jane",
  address: "412 Maple St",
  code: "BJ111026-A",
};

const early = openNextSteps(fresh);
assert.deepEqual(
  early.map((step) => step.id),
  ["call", "text", "schedule"],
);
assert.equal(early[0]?.title, "Call Jane back within 5 minutes");
assert.match(early[1]?.prompt ?? "", /Text Jane/);
assert.match(early[2]?.prompt ?? "", /412 Maple St/);
assert.equal(early.some((step) => step.id === "estimate"), false);

assert.equal(nextStepFor({ ...fresh, contacted: true, texted: true })?.id, "schedule");

const booked = nextStepFor({ ...fresh, contacted: true, texted: true, hasAppointment: true });
assert.equal(booked?.id, "estimate");
assert.match(booked?.prompt ?? "", /BJ111026-A/);

const readyToSend = nextStepFor({ ...fresh, contacted: true, texted: true, hasAppointment: true, hasDraft: true });
assert.equal(readyToSend?.id, "send");
assert.equal(readyToSend?.column, null);

assert.equal(
  nextStepFor({ ...fresh, contacted: true, texted: true, inspected: true, hasSent: true })?.id,
  "follow_up",
);

const supplement = nextStepFor({
  ...fresh,
  contacted: true,
  texted: true,
  inspected: true,
  hasSent: true,
  claimOpen: true,
});
assert.equal(supplement?.id, "supplement");
assert.equal(supplement?.column, "supplementing");

const waiting = nextStepFor({
  ...fresh,
  stage: "supplementing",
  contacted: true,
  texted: true,
  inspected: true,
  hasSent: true,
  claimOpen: true,
});
assert.equal(waiting?.action, "Follow up");
assert.equal(waiting?.column, null);

assert.equal(
  nextStepFor({ ...fresh, hasSigned: true, claimOpen: true })?.stage,
  "awarded",
);

const start = nextStepFor({ ...fresh, stage: "awarded", contractValue: 618 });
assert.equal(start?.id, "production");
assert.equal(start?.column, "in_progress");
assert.equal(start?.title, "Start production");

assert.equal(nextStepFor({ status: "in_progress" })?.column, "punch");
assert.equal(nextStepFor({ status: "punch" })?.column, "complete");
assert.equal(nextStepFor({ status: "complete" })?.action, "");
assert.equal(nextStepFor({ status: "on_hold" })?.id, "resume");
assert.equal(nextStepFor({ stage: "lost", status: "on_hold" }), null);
assert.equal(nextStepFor({ stage: "unqualified" }), null);
assert.equal(nextStepFor({ status: "precon", stage: "pursuing" })?.id, "schedule");

const fromBook = readNextStepFacts({
  job: { id: "job-1", status: "precon", contractValue: 0, opportunityId: "opp-1", code: "BJ1" },
  opportunity: { id: "opp-1", stage: "pursuing", code: "BJ1" },
  estimates: [
    { jobId: "job-1", opportunityId: "opp-1", status: "draft", archivedAt: null, signatureImage: "" },
    { jobId: "other", opportunityId: "other", status: "sent" },
  ],
  events: [{ jobId: "job-1", opportunityId: "opp-1", startsAt: "2026-11-24T15:00:00.000Z" }],
  messages: [{ jobId: "job-1", opportunityId: "opp-1", direction: "outbound" }],
  activities: [{ entityType: "job", entityId: "job-1", type: "call" }],
  claimStatus: "supplementing",
  now: new Date("2026-11-23T15:00:00.000Z"),
  firstName: "Jane",
});
assert.equal(fromBook.contacted, true);
assert.equal(fromBook.texted, true);
assert.equal(fromBook.hasAppointment, true);
assert.equal(fromBook.hasDraft, true);
assert.equal(fromBook.claimOpen, true);
assert.equal(nextStepFor(fromBook)?.id, "send");

const released = readNextStepFacts({
  job: { id: "job-1", status: "precon", opportunityId: "opp-1" },
  opportunity: { id: "opp-1", stage: "bid_submitted" },
  estimates: [{ jobId: "job-1", opportunityId: "opp-1", status: "viewed" }],
  claimStatus: "approved",
});
assert.equal(released.claimOpen, false);
assert.equal(nextStepFor(released)?.id, "follow_up");

console.log("next-steps.test.ts ok");
