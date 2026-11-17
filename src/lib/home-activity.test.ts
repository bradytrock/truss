import assert from "node:assert/strict";
import { buildHomeActivity, HOME_ACTIVITY_LIMIT, selectHomeActivity } from "./home-activity.ts";
import type {
  Activity,
  Estimate,
  EstimateSignatureEvent,
  Expense,
  Job,
  TextMessage,
} from "./types.ts";

const now = new Date(2026, 10, 16, 18, 0, 0);

function at(minutesAgo: number) {
  return new Date(now.getTime() - minutesAgo * 60_000).toISOString();
}

function job(partial: Pick<Job, "id"> & Partial<Job>): Job {
  return {
    code: "",
    opportunityId: null,
    name: partial.id,
    clientId: null,
    primaryContactId: null,
    status: "precon",
    contractValue: 0,
    startDate: "2026-11-01",
    substantialCompletion: null,
    superintendent: "",
    projectManager: "",
    location: "",
    ownerStaffId: "",
    description: "",
    tags: [],
    street: "",
    city: "",
    state: "",
    postalCode: "",
    salesRep: "",
    assigned: [],
    subcontractorIds: [],
    relatedContactIds: [],
    customFields: [],
    projectType: "roofing",
    market: "residential",
    trades: [],
    leadSource: "",
    primaryPhotoId: null,
    deletedAt: null,
    deletedReason: "",
    deletedBy: "",
    ...partial,
  };
}

function estimate(partial: Partial<Estimate> & Pick<Estimate, "id">): Estimate {
  return { number: "", jobId: null, opportunityId: null, contactId: null, status: "sent", sentAt: null, shareToken: "", archivedAt: null, ...partial } as Estimate;
}

function signature(partial: Partial<EstimateSignatureEvent> & Pick<EstimateSignatureEvent, "id" | "estimateId" | "kind" | "createdAt">): EstimateSignatureEvent {
  return {
    signerRole: "",
    contactId: null,
    signerName: "",
    tokenSuffix: "",
    tokenSha256: "",
    ipAddress: "",
    forwardedFor: "",
    userAgent: "",
    acceptLanguage: "",
    timeZone: "",
    deliveryChannel: "",
    deliveryTo: "",
    consentText: "",
    consentVersion: "",
    documentSha256: "",
    capturedInOffice: false,
    staffId: null,
    ...partial,
  };
}

function expense(partial: Partial<Expense> & Pick<Expense, "id">): Expense {
  return { number: "", invoiceNumber: "", jobId: null, vendor: "", amount: 0, incurredAt: "", createdAt: "", ...partial } as Expense;
}

function text(partial: Partial<TextMessage> & Pick<TextMessage, "id">): TextMessage {
  return {
    contactId: null,
    jobId: null,
    opportunityId: null,
    direction: "outbound",
    phone: "",
    body: "",
    handle: "",
    status: "sent",
    mediaUrl: "",
    kind: "text",
    detail: "",
    createdAt: "",
    createdBy: "Brady Jones",
    ...partial,
  };
}

const feed = buildHomeActivity({
  now,
  jobs: [
    job({
      id: "arrow",
      code: "BJ101426-A",
      name: "Arrowwood",
      primaryContactId: "brady",
      street: "545 Arrowwood Beach Circle",
      city: "Trinidad",
      state: "TX",
      postalCode: "75163",
    }),
    job({ id: "depot", code: "BJ091426-A", name: "Depot job", street: "12 Main", city: "Trinidad", state: "TX", postalCode: "75163" }),
    job({ id: "gone", code: "OLD", name: "Removed", deletedAt: now.toISOString() }),
  ],
  opportunities: [],
  estimates: [
    estimate({
      id: "est-arrow",
      number: "EST-1232",
      jobId: "arrow",
      contactId: "brady",
      status: "viewed",
      sentAt: at(13.4),
      shareToken: "share-arrow",
    }),
    estimate({ id: "draft", number: "EST-9", jobId: "arrow", status: "draft" }),
    estimate({ id: "deleted", number: "EST-1", jobId: "gone", status: "sent", sentAt: at(5), shareToken: "nope" }),
  ],
  signatureEvents: [
    signature({
      id: "open-1",
      estimateId: "est-arrow",
      kind: "opened",
      createdAt: at(13),
      signerName: "Brady Jones",
      contactId: "brady",
    }),
    signature({
      id: "sent-mail",
      estimateId: "est-arrow",
      kind: "sent",
      createdAt: at(13.4),
      deliveryChannel: "email",
      deliveryTo: "bradyalanjones.dallastx@gmail.com",
    }),
    signature({
      id: "sent-sms",
      estimateId: "est-arrow",
      kind: "sent",
      createdAt: at(13.4),
      deliveryChannel: "sms",
      deliveryTo: "9729222800",
    }),
    signature({
      id: "sent-link",
      estimateId: "est-arrow",
      kind: "sent",
      createdAt: at(13.4),
      deliveryChannel: "link",
      deliveryTo: "https://example.com/share",
    }),
  ],
  expenses: [
    expense({
      id: "exp-1",
      number: "EXP-1048",
      invoiceNumber: "235",
      jobId: "depot",
      vendor: "Jason Schane",
      amount: 2059.2,
      createdAt: at(58),
    }),
    expense({
      id: "exp-2",
      number: "EXP-1047",
      invoiceNumber: "9904182",
      jobId: "depot",
      vendor: "The Home Depot",
      amount: 790.8,
      createdAt: at(59),
    }),
    expense({ id: "old", number: "EXP-1", jobId: "depot", vendor: "Old", amount: 10, createdAt: at(20 * 24 * 60) }),
  ],
  messages: [
    text({ id: "t1", jobId: "arrow", contactId: "brady", body: "Can we walk it Thursday?", createdAt: at(26 * 60) }),
    text({ id: "t2", jobId: "arrow", contactId: "brady", direction: "inbound", body: "Thursday works.", createdAt: at(27 * 60) }),
    text({ id: "react", jobId: "arrow", kind: "reaction", body: "Liked", createdAt: at(10) }),
    text({ id: "auto", jobId: "arrow", body: "On my way", createdAt: at(4), createdBy: "automation" }),
  ],
  activities: [
    {
      id: "walk",
      entityType: "job",
      entityId: "arrow",
      type: "site_walk",
      body: "Inspection passed",
      createdAt: at(120),
      author: "Brady Jones",
    } as Activity,
  ],
  contacts: [{ id: "brady", name: "Brady Jones", phone: "9729222800", email: "bradyalanjones.dallastx@gmail.com" }],
});

assert.equal(feed.counts.proposals, 2);
assert.equal(feed.counts.messages, 2);
assert.equal(feed.counts.expenses, 3);
assert.equal(feed.counts.all, 8);
assert.equal(feed.days[0]?.label, "Today");
assert.equal(feed.days[1]?.label, "Yesterday");

const proposal = feed.days[0]?.groups.find((group) => group.bucket === "proposals");
assert.equal(proposal?.title, "545 Arrowwood Beach Circle");
assert.equal(proposal?.place, "Trinidad, TX 75163 · BJ101426-A");
assert.equal(proposal?.badge, "EST-1232");
assert.equal(proposal?.events[0]?.title, "Customer opened the proposal");
assert.equal(proposal?.events[0]?.detail, "Brady Jones viewed it — a good moment to follow up.");
assert.equal(proposal?.events[0]?.when, "13m ago");
assert.equal(proposal?.events[0]?.followUp, true);
assert.equal(proposal?.events[0]?.phone, "(972) 922-2800");
assert.match(proposal?.events[0]?.textHref ?? "", /compose=1/);
assert.match(proposal?.events[0]?.textHref ?? "", /job=arrow/);
assert.equal(proposal?.events[1]?.title, "You sent the proposal");
assert.equal(proposal?.events[1]?.when, "13m ago");
assert.equal(proposal?.events[1]?.followUp, false);
assert.deepEqual(
  proposal?.events[1]?.deliveries.map((row) => [row.channel, row.value, row.status]),
  [
    ["email", "bradyalanjones.dallastx@gmail.com", "Delivered"],
    ["text", "(972) 922-2800", "Delivered"],
  ],
);
assert.equal(proposal?.events[1]?.proposalHref, "/estimates/est-arrow");
assert.equal(proposal?.events[1]?.shareToken, "share-arrow");

const expenses = feed.days[0]?.groups.find((group) => group.bucket === "expenses");
assert.equal(expenses?.title, "2 expenses logged");
assert.equal(expenses?.jobCode, "BJ091426-A");
assert.equal(expenses?.expenseTotal, 2850);
assert.equal(expenses?.events[0]?.title, "Jason Schane");
assert.equal(expenses?.events[0]?.meta, "EXP-1048 · Invoice 235 · 58m ago");
assert.equal(expenses?.events[0]?.amount, 2059.2);
assert.equal(expenses?.events[1]?.title, "The Home Depot");
assert.equal(expenses?.events[1]?.amount, 790.8);

const messages = feed.days[1]?.groups[0];
assert.equal(messages?.bucket, "messages");
assert.equal(messages?.title, "545 Arrowwood Beach Circle");
assert.equal(messages?.events.length, 2);
assert.equal(messages?.events[0]?.title, "You texted Brady Jones");
assert.equal(messages?.events[1]?.title, "Brady Jones texted");

const progress = feed.days[0]?.groups.find((group) => group.bucket === "progress");
assert.equal(progress?.events[0]?.title, "Inspection passed");
assert.equal(feed.days[0]?.groups.some((group) => group.badge === "EST-1"), false);
assert.equal(feed.days[0]?.groups.some((group) => group.badge === "EST-9"), false);

const linkOnly = buildHomeActivity({
  now,
  jobs: [job({ id: "sam", code: "BJ1", name: "Sam", street: "1 Oak", city: "Dallas", state: "TX", postalCode: "75201" })],
  opportunities: [],
  estimates: [estimate({ id: "est-link", number: "EST-2", jobId: "sam", status: "sent", sentAt: at(30), shareToken: "" })],
  signatureEvents: [
    signature({ id: "link", estimateId: "est-link", kind: "sent", createdAt: at(30), deliveryChannel: "link", deliveryTo: "https://example.com" }),
  ],
});
assert.equal(linkOnly.counts.proposals, 1);
assert.equal(linkOnly.days[0]?.groups[0]?.events[0]?.deliveries.length, 0);
assert.equal(linkOnly.days[0]?.groups[0]?.events[0]?.shareToken, "");

const empty = buildHomeActivity({ now, jobs: [], opportunities: [], estimates: [] });
assert.equal(empty.counts.all, 0);
assert.deepEqual(empty.days, []);

const older = feed.days.flatMap((day) => day.groups).find((group) => group.events.some((event) => event.title === "Old"));
assert.equal(older?.title, "1 expense logged");
assert.equal(older?.expenseTotal, 10);

const today = selectHomeActivity(feed, { from: "2026-11-16", to: "2026-11-16" });
assert.equal(today.counts.proposals, 2);
assert.equal(today.counts.messages, 0);
assert.equal(today.counts.expenses, 2);
assert.equal(today.counts.all, 5);
assert.equal(today.total, 5);

const swapped = selectHomeActivity(feed, { from: "2026-11-16", to: "2026-11-15" });
assert.equal(swapped.counts.messages, 2);
assert.equal(swapped.counts.expenses, 2);
assert.equal(swapped.total, 7);

const fromOnly = selectHomeActivity(feed, { from: "2026-11-15" });
assert.equal(fromOnly.counts.messages, 2);
assert.equal(fromOnly.counts.expenses, 2);

const oneExpense = selectHomeActivity(feed, { filter: "expenses", limit: 1 });
assert.equal(oneExpense.total, 3);
assert.equal(oneExpense.shown, 1);
assert.equal(oneExpense.days[0]?.groups[0]?.title, "1 expense logged");
assert.equal(oneExpense.days[0]?.groups[0]?.expenseTotal, 2059.2);
assert.equal(oneExpense.days[0]?.groups[0]?.events[0]?.title, "Jason Schane");

const many = buildHomeActivity({
  now,
  jobs: [job({ id: "arrow", code: "BJ101426-A", name: "Arrowwood", street: "545 Arrowwood Beach Circle", city: "Trinidad", state: "TX", postalCode: "75163" })],
  opportunities: [],
  estimates: [],
  activities: Array.from({ length: 12 }, (_, index) => ({
    id: `note-${index}`,
    entityType: "job",
    entityId: "arrow",
    type: "note",
    body: `Note ${index}`,
    createdAt: at((index + 1) * 60),
    author: "Brady Jones",
  })) as Activity[],
});
const capped = selectHomeActivity(many, { limit: HOME_ACTIVITY_LIMIT });
assert.equal(capped.total, 12);
assert.equal(capped.shown, HOME_ACTIVITY_LIMIT);
const cappedTitles = capped.days.flatMap((day) => day.groups.flatMap((group) => group.events.map((event) => event.title)));
assert.equal(cappedTitles.length, 10);
assert.equal(cappedTitles[0], "Note 0");
assert.equal(cappedTitles.includes("Note 10"), false);
assert.equal(cappedTitles.includes("Note 11"), false);
const fullDay = selectHomeActivity(many, { from: "2026-11-16", to: "2026-11-16" });
assert.equal(fullDay.total, 12);
assert.equal(fullDay.shown, 12);

console.log("home-activity tests passed");
