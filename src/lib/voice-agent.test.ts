import assert from "node:assert/strict";
import {
  decideVoiceIntake,
  isOpenVoiceJob,
  isVoiceAuthor,
  mintVoiceWebhookToken,
  voiceAuthor,
  voiceCallActivityBody,
  voiceNotifySms,
  voiceToolPaths,
} from "./voice-agent.ts";

assert.equal(voiceAuthor("Jordan Hale"), "Voice · Jordan Hale");
assert.equal(isVoiceAuthor("Voice · Jordan Hale"), true);
assert.equal(isVoiceAuthor("Jordan Hale"), false);

assert.equal(isOpenVoiceJob({ status: "precon", deletedAt: null }), true);
assert.equal(isOpenVoiceJob({ status: "complete", deletedAt: null }), false);
assert.equal(isOpenVoiceJob({ status: "precon", deletedAt: "2026-01-01" }), false);

const called = "staff_a";
const attached = decideVoiceIntake({
  calledStaffId: called,
  openJob: { id: "job_b", opportunityId: "opp_b", ownerStaffId: "staff_b", contactId: "c1" },
});
assert.equal(attached.action, "attach");
assert.equal(attached.ownerStaffId, "staff_b");
assert.equal(attached.originatorStaffId, "staff_a");
assert.equal(attached.matchKind, "open_job");
assert.equal(attached.jobId, "job_b");

const past = decideVoiceIntake({
  calledStaffId: called,
  pastOwner: { staffId: "staff_b", assignable: true, contactId: "c1" },
});
assert.equal(past.action, "create");
assert.equal(past.ownerStaffId, "staff_b");
assert.equal(past.originatorStaffId, "staff_a");
assert.equal(past.matchKind, "past_client");

const locked = decideVoiceIntake({
  calledStaffId: called,
  pastOwner: { staffId: "staff_b", assignable: false, contactId: "c1" },
});
assert.equal(locked.action, "create");
assert.equal(locked.ownerStaffId, "staff_a");
assert.equal(locked.matchKind, "unknown");

const fresh = decideVoiceIntake({ calledStaffId: called });
assert.equal(fresh.action, "create");
assert.equal(fresh.ownerStaffId, "staff_a");
assert.equal(fresh.matchKind, "unknown");

const sms = voiceNotifySms({
  action: "attach",
  matchKind: "open_job",
  callerName: "Pat Nguyen",
  calledStaffName: "Alex Rivera",
  ownerName: "Jordan Hale",
  jobCode: "JH091226-A",
  notes: "Leak at the chimney.",
});
assert.match(sms, /Pat Nguyen/);
assert.match(sms, /Alex Rivera/);
assert.match(sms, /JH091226-A/);
assert.match(sms, /no new card/i);
assert.doesNotMatch(sms, /texted the homeowner/i);

const body = voiceCallActivityBody({
  calledStaffName: "Alex Rivera",
  ownerName: "Jordan Hale",
  action: "attach",
  notes: "Leak at the chimney.",
  transcript: "Caller asked for a tarp.",
});
assert.match(body, /Alex Rivera/);
assert.match(body, /No new card/);
assert.match(body, /Transcript/);

const token = mintVoiceWebhookToken();
assert.match(token, /^[0-9a-f]{48}$/);
assert.deepEqual(voiceToolPaths(), {
  lookup: "/api/voice/lookup",
  intake: "/api/voice/intake",
  book: "/api/voice/book",
  log: "/api/voice/log",
});

console.log("voice-agent.test.ts ok");
