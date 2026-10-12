import assert from "node:assert/strict";
import { formatTime, localYmd } from "./format.ts";
import {
  buildFieldHome,
  buildForecastDays,
  currentFieldSite,
  fieldMoney,
  fieldMessageWhen,
  parseOpenMeteo,
  tearOffNote,
  type FieldHomeInput,
} from "./field-home.ts";
import type { Contact, Job, Opportunity, Payment, ScheduleEvent, Task, TextMessage } from "./types.ts";

const now = new Date();
now.setHours(11, 40, 0, 0);
const start = new Date(now);
start.setHours(11, 13, 0, 0);
const end = new Date(now);
end.setHours(12, 30, 0, 0);

function shiftDays(days: number) {
  const next = new Date(now);
  next.setDate(next.getDate() + days);
  next.setHours(12, 0, 0, 0);
  return next;
}

function contact(partial: Partial<Contact> & Pick<Contact, "id" | "name">): Contact {
  return {
    clientId: null,
    title: "",
    email: "",
    phone: "",
    ownerStaffId: "",
    isReferralPartner: false,
    listingWatchUrl: "",
    listingWatchEnabled: false,
    ...partial,
  };
}

function opportunity(partial: Partial<Opportunity> & Pick<Opportunity, "id" | "name">): Opportunity {
  return {
    code: "",
    clientId: null,
    primaryContactId: "",
    stage: "pursuing",
    value: 0,
    bidDueAt: null,
    preBidWalkAt: null,
    location: "",
    projectType: "roofing",
    deliveryMethod: "fixed_price",
    estimator: "",
    winProbability: 10,
    nextStep: "",
    createdAt: "2026-10-01T12:00:00.000Z",
    ownerStaffId: "",
    ...partial,
  };
}

function job(partial: Partial<Job> & Pick<Job, "id" | "name">): Job {
  return {
    code: "",
    opportunityId: null,
    clientId: null,
    primaryContactId: null,
    status: "in_progress",
    contractValue: 0,
    startDate: "",
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

function event(partial: Partial<ScheduleEvent> & Pick<ScheduleEvent, "id">): ScheduleEvent {
  return {
    title: "",
    kind: "inspection",
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    location: "",
    assignee: "Brady Jones",
    opportunityId: null,
    jobId: null,
    clientId: null,
    notes: "",
    ...partial,
  };
}

function task(partial: Partial<Task> & Pick<Task, "id" | "title" | "dueAt">): Task {
  return {
    completed: false,
    relatedType: null,
    relatedId: null,
    assignee: "Brady Jones",
    ...partial,
  };
}

const sadler = contact({ id: "c-sadler", name: "Aaron Sadler", phone: "2145550100" });
const lead = opportunity({
  id: "o-sadler",
  name: "Sadler roof",
  primaryContactId: sadler.id,
  street: "3001 Long Prairie Rd",
  city: "Flower Mound",
  state: "TX",
  postalCode: "75022",
  value: 7900,
  estimator: "Brady Jones",
  createdAt: "2026-10-11T12:00:00.000Z",
});

function input(extra: Partial<FieldHomeInput> = {}): FieldHomeInput {
  return {
    staffName: "Brady Jones",
    staffId: "brady",
    events: [],
    jobs: [],
    opportunities: [lead],
    contacts: [sadler],
    tasks: [],
    payments: [],
    messages: [],
    wonDeals: [],
    ...extra,
  };
}

assert.equal(fieldMoney(31000), "$31K");
assert.equal(fieldMoney(28000), "$28K");
assert.equal(fieldMoney(7900), "$7.9K");
assert.equal(fieldMoney(800), "$800");

const live = currentFieldSite(
  input({
    events: [event({ id: "e1", opportunityId: lead.id, title: "Inspection" })],
  }),
  now,
);
assert.equal(live.presence?.label, "On site");
assert.equal(live.presence?.detail, `since ${formatTime(start.toISOString())}`);
assert.equal(live.site?.name, "Sadler");
assert.equal(live.site?.street, "3001 Long Prairie Rd");
assert.equal(live.site?.locality, "Flower Mound, TX 75022");
assert.equal(live.site?.badge, "LEAD");

const open = currentFieldSite(input(), now);
assert.equal(open.presence?.label, "Open");
assert.equal(open.site?.badge, "LEAD");

const ownedJob = job({
  id: "j1",
  name: "Keown",
  ownerStaffId: "brady",
  street: "10 Oak",
  city: "Denton",
  state: "TX",
  status: "in_progress",
});
const jobSite = currentFieldSite(input({ opportunities: [], jobs: [ownedJob] }), now);
assert.equal(jobSite.site?.badge, "JOB");
assert.equal(jobSite.site?.street, "10 Oak");

const home = buildFieldHome(
  input({
    tasks: [
      task({ id: "t-new", title: "Order dumpster", dueAt: localYmd(shiftDays(-1)), assignee: "Brady Jones" }),
      task({
        id: "t-call",
        title: "Call Jeremy Keown back",
        dueAt: localYmd(shiftDays(-6)),
        assignee: "Sam Rogers",
        relatedType: "opportunity",
        relatedId: lead.id,
      }),
      task({ id: "t-done", title: "Done", dueAt: localYmd(shiftDays(-20)), completed: true }),
    ],
    payments: [
      {
        id: "p1",
        invoiceId: "inv-1",
        jobId: null,
        amount: 18000,
        method: "check",
        paidAt: shiftDays(-2).toISOString(),
        reference: "",
        receiptUrl: "",
        receiptStoragePath: null,
        qbStatus: "not_in_qb",
        createdBy: "",
        postingStatus: "posted",
      } as Payment,
      {
        id: "p2",
        invoiceId: "inv-2",
        jobId: null,
        amount: 10000,
        method: "check",
        paidAt: shiftDays(-1).toISOString(),
        reference: "",
        receiptUrl: "",
        receiptStoragePath: null,
        qbStatus: "not_in_qb",
        createdBy: "",
        postingStatus: "posted",
      } as Payment,
      {
        id: "p-old",
        invoiceId: "inv-old",
        jobId: null,
        amount: 5000,
        method: "check",
        paidAt: shiftDays(-40).toISOString(),
        reference: "",
        receiptUrl: "",
        receiptStoragePath: null,
        qbStatus: "not_in_qb",
        createdBy: "",
      } as Payment,
    ],
    wonDeals: [
      { amount: 31000, wonAt: shiftDays(-2).toISOString(), source: "", sourceLabel: "" },
      { amount: 9000, wonAt: shiftDays(-40).toISOString(), source: "", sourceLabel: "" },
    ],
    messages: [
      {
        id: "m1",
        contactId: sadler.id,
        jobId: null,
        opportunityId: lead.id,
        direction: "outbound",
        phone: "2145550100",
        body: "Hi Glenda, T Rock Roofing & Contracting can be there Thursday",
        handle: "h1",
        status: "sent",
        mediaUrl: "",
        kind: "text",
        detail: "",
        createdAt: shiftDays(-4).toISOString(),
        createdBy: "Brady Jones",
      } as TextMessage,
    ],
  }),
  now,
);

assert.equal(home.greeting, "Morning");
assert.equal(home.firstName, "Brady");
assert.equal(home.attention.count, 2);
assert.equal(home.attention.oldestDays, 6);
assert.equal(home.attention.tasks[0]?.id, "t-call");
assert.equal(home.attention.tasks[0]?.action, "call");
assert.equal(home.attention.tasks[0]?.who, "Sam Rogers");
assert.equal(home.wonAmount, 31000);
assert.equal(home.wonCount, 1);
assert.equal(home.collectedAmount, 28000);
assert.equal(home.collectedCount, 2);
assert.equal(home.pipelineAmount, 7900);
assert.equal(home.pipelineCount, 1);
assert.equal(home.messages[0]?.preview.startsWith("You: Hi Glenda"), true);
assert.equal(home.messages[0]?.when, "4d");

const days = buildForecastDays(
  {
    time: ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"],
    weatherCode: [0, 1, 61, 0],
    tempMax: [88, 90, 87, 87],
    tempMin: [71, 76, 76, 72],
    precipProb: [5, 10, 70, 8],
  },
  now,
);
assert.equal(days[0]?.label, "Today");
assert.equal(days[2]?.rain, true);
assert.equal(days[2]?.emphasize, true);
assert.equal(tearOffNote(days), "Rain Wednesday — plan tear-offs for Mon, Tue or Thu");
assert.equal(tearOffNote(days.map((day) => ({ ...day, rain: false }))), null);

const parsed = parseOpenMeteo({
  daily: {
    time: ["2026-10-12"],
    weather_code: [0],
    temperature_2m_max: [88.2],
    temperature_2m_min: [71.4],
    precipitation_probability_max: [0],
  },
}, now);
assert.equal(parsed?.[0]?.high, 88);
assert.equal(parsed?.[0]?.low, 71);

console.log("field-home tests passed");
