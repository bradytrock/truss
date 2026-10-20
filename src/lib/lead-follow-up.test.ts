import assert from "node:assert/strict";
import { alertForMyAssignmentInsert, snapshotFromRow, type LeadSnapshot } from "./lead-alerts.ts";
import { appointmentBookingContext, bookLeadAppointment, saveLeadUpdate, type LeadFollowUpCrm } from "./lead-follow-up.ts";

function lead(overrides: Partial<LeadSnapshot> = {}): LeadSnapshot {
  return snapshotFromRow({
    id: "lead-1",
    company_id: "co-1",
    opportunity_id: "opp-1",
    job_id: "job-1",
    status: "assigned",
    assigned_to: "pm-1",
    assigned_by: "admin-1",
    homeowner_name: "Dana Alvarez",
    street: "100 Main",
    city: "Plano",
    service_type: "roofing",
    source: "website",
    phone: "2145550100",
    created_at: "2026-10-04T17:00:00.000Z",
    updated_at: "2026-10-04T17:00:00.000Z",
    ...overrides,
  });
}

const alert = alertForMyAssignmentInsert(lead(), "pm-1", 100)!;

function crm(log: string[]): LeadFollowUpCrm {
  return {
    getOpportunity: () => ({
      clientId: "client-1",
      primaryContactId: "contact-1",
      state: "TX",
      postalCode: "75024",
      street: "100 Main",
      city: "Plano",
      projectType: "roofing",
      nextStep: "",
      notes: "",
    }),
    getJob: () => ({
      clientId: "client-1",
      primaryContactId: "contact-1",
      state: "TX",
      postalCode: "75024",
      street: "100 Main",
      city: "Plano",
      description: "",
    }),
    getContact: () => ({ name: "Dana Alvarez", phone: "2145550100", email: "dana@example.com" }),
    addScheduleEvent: async (input) => {
      log.push(`event:${input.jobId}:${input.opportunityId}:${input.kind}:${input.assignee}:${input.clientId}:${input.location}`);
      return { id: "evt-1" };
    },
    updateOpportunity: async (_id, patch) => {
      log.push(`opportunity:${JSON.stringify(patch)}`);
      return true;
    },
    updateJob: async (_id, patch) => {
      log.push(`job:${JSON.stringify(patch)}`);
      return true;
    },
    updateContact: async (_id, patch) => {
      log.push(`contact:${JSON.stringify(patch)}`);
      return true;
    },
    addActivity: async (input) => {
      log.push(`activity:${input.entityType}:${input.type}:${input.body}`);
    },
  };
}

async function main() {
const booked: string[] = [];
await bookLeadAppointment(
  crm(booked),
  alert,
  {
    title: "Site walk · Dana Alvarez",
    kind: "site_walk",
    date: "2026-10-05",
    startTime: "09:00",
    endTime: "10:00",
    location: "100 Main, Plano",
    notes: "Bring the ladder",
  },
  "Alex Rivera",
);
assert.equal(booked[0], "event:job-1:opp-1:site_walk:Alex Rivera:client-1:100 Main, Plano");
assert.match(booked[1] ?? "", /activity:job:site_walk:Booked Site walk · Dana Alvarez on 2026-10-05 at 09:00 · 100 Main, Plano/);

const invited: string[] = [];
const inviteCrm = crm(invited);
const originalAdd = inviteCrm.addScheduleEvent;
inviteCrm.addScheduleEvent = async (input) => {
  invited.push(`guests:${(input.guestEmails ?? []).join(",")}`);
  return originalAdd(input);
};
await bookLeadAppointment(
  inviteCrm,
  alert,
  {
    title: "Site walk · Dana Alvarez",
    kind: "site_walk",
    date: "2026-10-05",
    startTime: "09:00",
    endTime: "10:00",
    location: "100 Main, Plano",
    notes: "",
    notifyEmail: "dana@example.com",
    assignee: "Priya Shah",
  },
  "Alex Rivera",
);
assert.match(invited[0] ?? "", /guests:dana@example.com/);
assert.match(invited[1] ?? "", /event:job-1:opp-1:site_walk:Priya Shah/);

const facts = appointmentBookingContext(
  {
    ...crm([]),
    userName: "Brady Jones",
    staff: [
      { name: "Brady Jones" },
      { name: "Priya Shah" },
      { name: "Locked Rep", locked: true },
    ],
    events: [],
  },
  lead(),
);
assert.equal(facts.assigneeName, "Brady Jones");
assert.deepEqual(facts.teammates, ["Priya Shah"]);
assert.equal(facts.homeownerEmail, "dana@example.com");

const saved: string[] = [];
let wrote = false;
const row = await saveLeadUpdate(
  crm(saved),
  alert,
  {
    homeownerName: "Dana Alvarez",
    phone: "2145550199",
    email: "dana@example.com",
    street: "200 Oak",
    city: "Frisco",
    state: "TX",
    postalCode: "75034",
    serviceType: "roofing",
    nextStep: "Walk Thursday",
    notes: "Hail on the south slope",
  },
  async (_id, details) => {
    wrote = true;
    assert.equal(details.street, "200 Oak");
    assert.equal(details.city, "Frisco");
    assert.equal(details.phone, "(214) 555-0199");
    assert.equal(details.serviceType, "roofing");
    return lead({ ...details, street: details.street, city: details.city, phone: details.phone, updated_at: "2026-10-04T18:00:00.000Z" });
  },
);
assert.equal(wrote, true);
assert.equal(row.updated_at, "2026-10-04T18:00:00.000Z");
assert.match(saved[0] ?? "", /contact:/);
assert.match(saved[0] ?? "", /214\) 555-0199/);
assert.match(saved[1] ?? "", /"street":"200 Oak"/);
assert.match(saved[1] ?? "", /"nextStep":"Walk Thursday"/);
assert.doesNotMatch(saved[1] ?? "", /"name":/);
assert.match(saved[2] ?? "", /"description":"Hail on the south slope"/);
assert.match(saved[3] ?? "", /Updated the lead\. Next step: Walk Thursday/);

const blocked: string[] = [];
const failing = crm(blocked);
failing.updateOpportunity = async () => false;
await assert.rejects(
  () =>
    saveLeadUpdate(failing, alert, {
      homeownerName: "Dana Alvarez",
      phone: "2145550100",
      email: "",
      street: "100 Main",
      city: "Plano",
      state: "TX",
      postalCode: "75024",
      serviceType: "roofing",
      nextStep: "",
      notes: "",
    }, async () => {
      throw new Error("should not write the lead row");
    }),
  /Couldn't update this lead/,
);

console.log("lead-follow-up.test.ts ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
