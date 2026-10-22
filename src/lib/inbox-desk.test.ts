import assert from "node:assert/strict";
import {
  appointmentLabel,
  buildInboxTimeline,
  cassioTextDraft,
  daysSinceLabel,
  formatCallDuration,
  formatInboxDay,
  jobProgress,
  quickReplyBody,
  smsSegmentLabel,
  inboxChips,
  inboxQueue,
  inboxRoleLabel,
  inboxStage,
  isAutomatedText,
  reviewRequestDraft,
  shortStaffName,
  threadIsMine,
  threadIsUnassigned,
  threadMatchesScope,
  threadOwnerId,
} from "./inbox-desk.ts";
import type { Activity, GmailMessage, TextMessage } from "./types.ts";

function text(partial: Partial<TextMessage> & Pick<TextMessage, "id" | "direction" | "createdAt">): TextMessage {
  return {
    contactId: null,
    jobId: null,
    opportunityId: null,
    phone: "",
    body: "",
    handle: "",
    status: "delivered",
    mediaUrl: "",
    kind: "text",
    detail: "",
    createdBy: "Ada",
    ...partial,
  };
}

const inbound = text({
  id: "in",
  direction: "inbound",
  createdAt: "2026-10-16T21:52:00.000Z",
  body: "Sounds good",
});
const outbound = text({
  id: "out",
  direction: "outbound",
  createdAt: "2026-10-16T21:36:00.000Z",
  body: "On my way",
  createdBy: "Automation",
  kind: "automation",
});

assert.equal(inboxQueue({ messages: [outbound, inbound] }), "needs_reply");
assert.equal(
  inboxQueue({
    messages: [inbound, text({ id: "out-later", direction: "outbound", createdAt: "2026-10-16T22:10:00.000Z", body: "Thanks" })],
  }),
  "waiting",
);
assert.equal(inboxQueue({ messages: [inbound] }, "2026-10-16T22:00:00.000Z"), "waiting");
assert.equal(inboxQueue({ messages: [inbound] }, "2026-10-16T21:00:00.000Z"), "needs_reply");
assert.equal(isAutomatedText(outbound), true);
assert.equal(isAutomatedText(inbound), false);

const owned = {
  contact: { ownerStaffId: "staff_brady" },
  job: { ownerStaffId: "", salesRep: "Elena Voss" },
  opportunity: null,
};
assert.equal(threadOwnerId(owned), "staff_brady");
assert.equal(threadIsMine(owned, { staffId: "staff_brady", name: "Someone" }), true);
assert.equal(threadIsMine({ contact: null, job: { salesRep: "Elena Voss" }, opportunity: null }, { staffId: "x", name: "Elena Voss" }), true);
assert.equal(threadIsUnassigned({ contact: null, job: null, opportunity: null }), true);
assert.equal(threadIsUnassigned(owned), false);
assert.equal(
  threadMatchesScope({ scope: "unread", mine: true, unread: false, unassigned: false, automatedOnly: false, automated: false }),
  false,
);
assert.equal(
  threadMatchesScope({ scope: "all", mine: false, unread: false, unassigned: true, automatedOnly: true, automated: false }),
  false,
);

assert.deepEqual(
  inboxChips({
    contact: { isReferralPartner: true },
    opportunity: { leadSource: "website", stage: "pursuing" },
    automated: true,
  }),
  ["Referral", "New lead", "Web", "Automated"],
);
assert.equal(shortStaffName("Brady Jones"), "Brady J.");
assert.equal(shortStaffName("Elena"), "Elena");
assert.equal(formatCallDuration(134), "2m 14s");
assert.equal(formatCallDuration(8), "8s");
assert.equal(formatInboxDay("2026-10-20T15:00:00.000Z", new Date("2026-10-20T18:00:00.000Z")), "Today");
assert.equal(smsSegmentLabel(""), "");
assert.equal(smsSegmentLabel("hello"), "5 chars · 1 text");
assert.equal(daysSinceLabel("2026-10-15T12:00:00.000Z", new Date("2026-10-20T12:00:00.000Z")), "5 days");
assert.match(quickReplyBody("omw", "Linda Whitfield"), /On my way, Linda/);
assert.match(cassioTextDraft("Linda", "When does the adjuster come out?"), /confirm the time/);
assert.equal(jobProgress("in_progress") > jobProgress("precon"), true);

assert.deepEqual(inboxStage({ inspected: true, hasSentEstimate: false, opportunity: { stage: "pursuing", nextStep: "" } }), {
  current: "Inspected",
  next: "Estimate next",
  detail: "",
});
assert.equal(
  inboxStage({
    job: { status: "in_progress" },
    opportunity: { stage: "won", nextStep: "Cabinets land Thursday. Keep Nora off the old layout." },
  }).next,
  "Punch next",
);
assert.equal(inboxStage({ job: { status: "in_progress" } }).current, "In progress");
assert.equal(inboxRoleLabel({ title: "", market: "residential" }), "Homeowner");
assert.equal(inboxRoleLabel({ title: "Adjuster" }), "Adjuster");
assert.match(reviewRequestDraft("Brady Jones"), /^Hi Brady,/);
assert.equal(appointmentLabel({ title: "Adjuster meeting", kind: "meeting", startsAt: "2026-10-22T15:00:00.000Z" }).includes("Adjuster meeting"), true);

const email: GmailMessage = {
  id: "mail_1",
  accountId: "a",
  gmailId: "g",
  threadId: "t",
  fromName: "Office",
  fromEmail: "office@example.com",
  toEmail: "brady@example.com",
  subject: "Inspection summary",
  snippet: "Thanks for having us out",
  bodyText: "Thanks for having us out",
  receivedAt: "2026-10-17T13:15:00.000Z",
  direction: "outbound",
  jobId: "job_a",
  contactId: "con_brady",
  ccEmail: "",
  relatedContactIds: [],
};
const note: Activity = {
  id: "note_1",
  entityType: "job",
  entityId: "job_a",
  type: "note",
  body: "Soft decking on the NE slope.",
  createdAt: "2026-10-17T00:40:00.000Z",
  author: "Brady Jones",
};
const otherNote: Activity = { ...note, id: "note_2", entityId: "job_b", body: "Other job" };

const timeline = buildInboxTimeline({
  messages: [
    text({ id: "t1", direction: "outbound", createdAt: "2026-10-16T21:36:00.000Z", jobId: "job_a", body: "On the way" }),
    text({ id: "t2", direction: "inbound", createdAt: "2026-10-16T21:52:00.000Z", jobId: "job_b", body: "Other job" }),
  ],
  emails: [email],
  calls: [
    {
      id: "call_1",
      direction: "inbound",
      startedAt: "2026-10-16T22:20:00.000Z",
      durationSeconds: 134,
      status: "ended",
      contactId: "con_brady",
      jobId: "job_a",
      fromNumber: "9729222800",
    },
  ],
  activities: [note, otherNote],
  contactIds: ["con_brady"],
  phone: "(972) 922-2800",
  focusJobId: "job_a",
  primaryJobId: "job_a",
  jobIds: ["job_a", "job_b"],
  opportunityIds: [],
  channel: "all",
});

assert.deepEqual(
  timeline.map((entry) => entry.kind),
  ["text", "call", "note", "email"],
);
assert.equal(timeline.filter((entry) => entry.kind === "text").length, 1);

const notesOnly = buildInboxTimeline({
  messages: [inbound],
  emails: [email],
  calls: [],
  activities: [note],
  contactIds: ["con_brady"],
  phone: "",
  focusJobId: null,
  primaryJobId: "job_a",
  jobIds: ["job_a"],
  opportunityIds: [],
  channel: "notes",
});
assert.equal(notesOnly.length, 1);
assert.equal(notesOnly[0]?.kind, "note");
