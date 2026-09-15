import assert from "node:assert/strict";
import {
  avatarTone,
  buildContactBook,
  contactFilterCounts,
  contactStage,
  contactTypeLine,
  formatLastContactAt,
  parseContactCsv,
  parseContactFilter,
  visibleContactRows,
} from "./contact-book.ts";
import type {
  Activity,
  Client,
  Contact,
  Estimate,
  Job,
  Opportunity,
  Task,
} from "./types.ts";

const now = new Date("2026-09-15T15:00:00");

function contact(partial: Partial<Contact> & Pick<Contact, "id" | "name">): Contact {
  return {
    clientId: null,
    title: "Homeowner",
    email: "",
    phone: "",
    ownerStaffId: "staff_1",
    isReferralPartner: false,
    listingWatchUrl: "",
    listingWatchEnabled: false,
    ...partial,
  };
}

function client(partial: Partial<Client> & Pick<Client, "id" | "name">): Client {
  return {
    type: "owner",
    city: "",
    state: "",
    notes: "",
    ...partial,
  };
}

function job(partial: Partial<Job> & Pick<Job, "id" | "name">): Job {
  return {
    code: "BJ1",
    opportunityId: null,
    clientId: null,
    primaryContactId: null,
    status: "precon",
    contractValue: 0,
    startDate: "2026-09-01",
    substantialCompletion: null,
    superintendent: "",
    projectManager: "",
    location: "",
    ownerStaffId: "",
    description: "",
    tags: [],
    street: "100 Main St",
    city: "Flower Mound",
    state: "TX",
    postalCode: "75028",
    salesRep: "",
    assigned: [],
    subcontractorIds: [],
    relatedContactIds: [],
    customFields: [],
    projectType: "roofing",
    market: "residential",
    leadSource: "website",
    primaryPhotoId: null,
    deletedAt: null,
    deletedReason: "",
    deletedBy: "",
    ...partial,
  };
}

function opportunity(partial: Partial<Opportunity> & Pick<Opportunity, "id" | "name">): Opportunity {
  return {
    code: "L1",
    clientId: null,
    primaryContactId: "",
    stage: "pursuing",
    value: 0,
    bidDueAt: null,
    preBidWalkAt: null,
    location: "",
    projectType: "roofing",
    deliveryMethod: "insurance_claim",
    estimator: "",
    winProbability: 20,
    nextStep: "",
    createdAt: "2026-09-10T12:00:00",
    ownerStaffId: "",
    leadSource: "website",
    street: "",
    city: "",
    state: "",
    postalCode: "",
    ...partial,
  };
}

function estimate(partial: Partial<Estimate> & Pick<Estimate, "id" | "number">): Estimate {
  return {
    name: "Roof",
    clientId: null,
    opportunityId: null,
    jobId: null,
    contactId: null,
    secondContactId: null,
    status: "draft",
    notes: "",
    validUntil: null,
    sentAt: null,
    acceptedAt: null,
    secondAcceptedAt: null,
    ownerSignedAt: null,
    ownerSignedName: "",
    createdAt: "2026-09-10T12:00:00",
    taxRate: 0,
    discountKind: "percent",
    discountValue: 0,
    depositKind: "percent",
    depositValue: 0,
    intro: "",
    terms: "",
    street: "",
    city: "",
    state: "",
    postalCode: "",
    shareToken: "",
    secondShareToken: "",
    signatureName: "",
    signatureImage: "",
    secondSignatureName: "",
    secondSignatureImage: "",
    packageMode: "",
    selectedPackage: "better",
    marginPercent: 0,
    subtotalOverride: null,
    hideLinePrices: false,
    ...partial,
  };
}

function task(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    dueAt: "2026-09-14",
    completed: false,
    relatedType: null,
    relatedId: null,
    assignee: "",
    ...partial,
  };
}

function activity(partial: Partial<Activity> & Pick<Activity, "id" | "body">): Activity {
  return {
    entityType: "job",
    entityId: "job_1",
    type: "note",
    createdAt: "2026-09-14T12:00:00",
    author: "Brady",
    ...partial,
  };
}

assert.ok(avatarTone("Brady Jones").bg);
assert.equal(parseContactFilter("prop"), "prop");
assert.equal(parseContactFilter("nope"), "all");

assert.equal(contactTypeLine(contact({ id: "c1", name: "Dana" })), "Homeowner");
assert.equal(
  contactTypeLine(contact({ id: "c2", name: "Chris", title: "Realtor", isReferralPartner: true })),
  "Realtor",
);
assert.equal(
  contactTypeLine(contact({ id: "c3", name: "Church", title: "Pastor Ray" }), client({ id: "cl1", name: "Brookside" })),
  "Commercial · Pastor Ray",
);

assert.equal(contactStage([], []), "lead");
assert.equal(
  contactStage([], [estimate({ id: "e1", number: "EST-1", status: "sent", contactId: "c1" })]),
  "prop",
);
assert.equal(contactStage([job({ id: "j1", name: "Roof", status: "precon" })], []), "cust");
assert.equal(contactStage([job({ id: "j1", name: "Roof", status: "complete" })], []), "past");
assert.equal(
  contactStage(
    [job({ id: "j1", name: "Old", status: "complete" })],
    [estimate({ id: "e1", number: "EST-1", status: "sent" })],
  ),
  "prop",
);
assert.equal(
  contactStage([], [estimate({ id: "e1", number: "EST-1", status: "accepted" })]),
  "cust",
);

assert.equal(formatLastContactAt("2026-09-15T14:00:00", now), "1h ago");
assert.equal(formatLastContactAt("2026-09-14", now), "Yesterday");
assert.equal(formatLastContactAt("2026-08-28", now), "Aug 28");

const lead = contact({ id: "c_lead", name: "Don Ojamaye", phone: "(214) 555-0129" });
const customer = contact({
  id: "c_cust",
  name: "Anthony Leonardo",
  phone: "(972) 555-0142",
  email: "a.leonardo@example.com",
});
const past = contact({ id: "c_past", name: "Maria Delgado", phone: "(469) 555-0171" });
const partner = contact({
  id: "c_part",
  name: "Chris Jones",
  title: "Realtor",
  isReferralPartner: true,
  phone: "9725550165",
});

const rows = buildContactBook(
  {
    contacts: [past, partner, customer, lead],
    clients: [],
    jobs: [
      job({ id: "j_cust", name: "Roof replacement", code: "BJ091426-A", primaryContactId: "c_cust" }),
      job({ id: "j_past", name: "Roof replacement", code: "BJ081226-A", primaryContactId: "c_past", status: "complete" }),
    ],
    opportunities: [
      opportunity({ id: "o_lead", name: "Hail inspect", primaryContactId: "c_lead", leadSource: "website" }),
      opportunity({ id: "o_prop", name: "Listing roof", primaryContactId: "c_part", leadSource: "referral" }),
    ],
    estimates: [
      estimate({
        id: "e_prop",
        number: "EST-9",
        status: "viewed",
        contactId: "c_part",
        opportunityId: "o_prop",
        sentAt: "2026-09-14T18:00:00",
      }),
    ],
    tasks: [
      task({ id: "t1", title: "Call back", relatedType: "job", relatedId: "j_cust", dueAt: "2026-09-14" }),
      task({ id: "t2", title: "Done", relatedType: "job", relatedId: "j_cust", completed: true }),
    ],
    activities: [
      activity({ id: "a1", body: "Inspection completed", entityId: "j_cust", createdAt: "2026-09-14T10:00:00" }),
    ],
  },
  now,
);

assert.deepEqual(
  rows.map((row) => row.name),
  ["Anthony Leonardo", "Chris Jones", "Don Ojamaye", "Maria Delgado"],
);

const anthony = rows.find((row) => row.id === "c_cust");
assert.ok(anthony);
assert.equal(anthony.stage, "cust");
assert.equal(anthony.overdueCallback, true);
assert.equal(anthony.openTaskCount, 1);
assert.equal(anthony.address.includes("100 Main"), true);
assert.equal(anthony.lastContactLabel, "Yesterday");
assert.equal(anthony.jobs[0]?.code, "BJ091426-A");

const chris = rows.find((row) => row.id === "c_part");
assert.ok(chris);
assert.equal(chris.stage, "prop");
assert.equal(chris.typeLine, "Realtor");
assert.equal(chris.sourceLabel, "Referral");
assert.match(chris.activity[0]?.title ?? "", /Proposal EST-9 sent/);

const don = rows.find((row) => row.id === "c_lead");
assert.ok(don);
assert.equal(don.stage, "lead");
assert.match(don.activity[0]?.title ?? "", /Lead from Website/);

const maria = rows.find((row) => row.id === "c_past");
assert.ok(maria);
assert.equal(maria.stage, "past");

const counts = contactFilterCounts(rows);
assert.equal(counts.all, 4);
assert.equal(counts.lead, 1);
assert.equal(counts.prop, 1);
assert.equal(counts.cust, 1);
assert.equal(counts.past, 1);
assert.equal(counts.tasks, 1);

assert.equal(visibleContactRows(rows, "lead", "").map((row) => row.id).join(), "c_lead");
assert.equal(visibleContactRows(rows, "tasks", "").map((row) => row.id).join(), "c_cust");
assert.equal(visibleContactRows(rows, "all", "555-0142").map((row) => row.id).join(), "c_cust");
assert.equal(visibleContactRows(rows, "all", "flower mound").length, 2);

const imported = parseContactCsv(`name,phone,email,title
Sam Rogers,(469) 555-0113,sam@example.com,Homeowner
,no-name@example.com,,
"Jones, Chris",(972) 555-0165,chris@example.com,Realtor
`);
assert.equal(imported.rows.length, 2);
assert.equal(imported.rows[0]?.name, "Sam Rogers");
assert.equal(imported.rows[1]?.name, "Jones, Chris");
assert.equal(imported.issues.length, 1);

const noHeader = parseContactCsv("Linda Tran,(469) 555-0104,ltran@example.com");
assert.equal(noHeader.rows[0]?.name, "Linda Tran");
assert.equal(noHeader.rows[0]?.phone, "(469) 555-0104");

const firstLast = parseContactCsv("first,last,mobile\nKen,Kowalski,2145550138");
assert.equal(firstLast.rows[0]?.name, "Ken Kowalski");
assert.equal(firstLast.rows[0]?.phone, "(214) 555-0138");

console.log("contact-book tests passed");
