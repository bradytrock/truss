import assert from "node:assert/strict";
import { buildHomeDesk, customerMismatchIssue, PROPOSAL_FOLLOW_UP_TASK } from "./home-desk.ts";
import type { Activity, Estimate, EstimateLine, Job, Opportunity, ScheduleEvent, Task } from "./types.ts";

const now = new Date(2026, 9, 13, 13, 8, 0);

function job(partial: Pick<Job, "id" | "opportunityId" | "status"> & Partial<Job>): Job {
  return {
    code: partial.code ?? partial.id,
    name: partial.name ?? partial.id,
    clientId: null,
    primaryContactId: null,
    contractValue: 0,
    startDate: "2026-10-01",
    substantialCompletion: null,
    superintendent: "",
    projectManager: "",
    location: "",
    ownerStaffId: "ada",
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

function opportunity(partial: Pick<Opportunity, "id" | "stage"> & Partial<Opportunity>): Opportunity {
  return {
    code: partial.id,
    name: partial.name ?? partial.id,
    clientId: null,
    primaryContactId: null,
    value: 0,
    bidDueAt: null,
    preBidWalkAt: null,
    location: "",
    projectType: "roofing",
    market: "residential",
    deliveryMethod: "negotiated",
    estimator: "",
    winProbability: 15,
    nextStep: "",
    createdAt: "2026-10-01T12:00:00",
    ownerStaffId: "ada",
    leadSource: "",
    ...partial,
  };
}

function task(partial: Pick<Task, "id" | "title" | "dueAt"> & Partial<Task>): Task {
  return {
    completed: false,
    relatedType: null,
    relatedId: null,
    assignee: "Brady Jones",
    ...partial,
  };
}

function base(overrides: Partial<Parameters<typeof buildHomeDesk>[0]> = {}) {
  return buildHomeDesk({
    now,
    firstName: "Brady",
    jobs: [],
    opportunities: [],
    estimates: [],
    lines: [] as EstimateLine[],
    tasks: [],
    events: [],
    activities: [],
    contacts: [],
    customerName: (item) => item.name,
    closeouts: [],
    signed: { amount: 34000, count: 3, avg: 11000 },
    quota: 280000,
    qb: null,
    accounting: [],
    returning: [],
    jobCodes: [],
    ...overrides,
  });
}

assert.equal(customerMismatchIssue("Keown — 1248 Michael Ave", "Adam Kubitz"), "Customer is Adam Kubitz — mismatch?");
assert.equal(customerMismatchIssue("Albert Johnston — 2929 Pritchett", "Albert Johnston"), null);
assert.equal(customerMismatchIssue("Roof replacement", "Adam Kubitz"), null);

const desk = base({
  jobs: [
    job({
      id: "albert",
      opportunityId: "opp-albert",
      status: "precon",
      code: "SR100626-A",
      name: "Albert Johnston",
      primaryContactId: "c-albert",
      projectManager: "Sam Rogers",
    }),
    job({
      id: "albert-b",
      opportunityId: "opp-albert",
      status: "precon",
      code: "SR100626-B",
      name: "Albert Johnston",
      projectManager: "Sam Rogers",
    }),
    job({
      id: "keown",
      opportunityId: "opp-keown",
      status: "punch",
      code: "BJ100626-B",
      name: "Keown — 1248 Michael Ave, Lewisville",
      location: "1248 Michael Ave, Lewisville",
      street: "1248 Michael Ave",
      city: "Lewisville",
      projectManager: "Brady Jones",
    }),
    job({
      id: "prod",
      opportunityId: "opp-prod",
      status: "in_progress",
      code: "BJ100126-A",
      name: "Production",
      contractValue: 0,
      location: "100 Main",
      street: "100 Main",
    }),
  ],
  opportunities: [
    opportunity({ id: "opp-albert", stage: "bid_submitted", value: 4000, leadSource: "phone" }),
    opportunity({ id: "opp-keown", stage: "awarded", value: 0, leadSource: "website" }),
    opportunity({ id: "opp-prod", stage: "awarded", value: 580220, leadSource: "phone" }),
    opportunity({ id: "opp-lead", stage: "pursuing", value: 1000, leadSource: "referral" }),
  ],
  estimates: [
    {
      id: "est-albert",
      jobId: "albert",
      opportunityId: "opp-albert",
      status: "sent",
      archivedAt: null,
      sentAt: "2026-10-06T15:00:00",
      acceptedAt: null,
      taxRate: 0,
    } as Estimate,
  ],
  tasks: [
    task({
      id: "raynor",
      title: "Call Raynor Durham back",
      dueAt: "2026-10-10",
      relatedType: "job",
      relatedId: "prod",
    }),
    task({ id: "materials", title: "Order ridge vent", dueAt: "2026-10-11" }),
    task({
      id: "tomorrow",
      title: "New listing from Jeremy Keown: swimming pool",
      dueAt: "2026-10-14",
      assignee: "Brady Jones",
    }),
    task({ id: "tomorrow-2", title: "Pool follow up", dueAt: "2026-10-14", assignee: "Brady Jones" }),
    task({ id: "tomorrow-3", title: "Pool photos", dueAt: "2026-10-14", assignee: "Brady Jones" }),
  ],
  events: [
    {
      id: "earlier",
      title: "Roof maintenance — Avanne",
      kind: "production",
      startsAt: "2026-10-13T10:00:00",
      endsAt: "2026-10-13T10:45:00",
      location: "4608 Darlington Drive, Flower Mound",
      assignee: "",
      opportunityId: null,
      jobId: null,
      clientId: null,
      notes: "",
    } as ScheduleEvent,
  ],
  activities: [
    {
      id: "act-1",
      entityType: "job",
      entityId: "prod",
      type: "stage_change",
      body: "Job marked complete",
      createdAt: "2026-10-13T12:00:00",
      author: "Brady Jones",
    } as Activity,
  ],
  contacts: [{ id: "c-albert", name: "Albert Johnston", phone: "2145550100" }],
  customerName: (item) => (item.id === "keown" ? "Adam Kubitz" : item.name),
  qb: { invoiceCount: 4, expenseCount: 14, paymentCount: 10 },
});

assert.match(desk.greeting, /Good afternoon, Brady/);
assert.match(desk.briefLabel, /October 13/);
assert.match(desk.briefLabel, /Cassio's brief/);
assert.equal(desk.rows[0]?.badge, "CALLBACK");
assert.match(desk.rows[0]?.title ?? "", /Albert Johnston/);
assert.match(desk.rows[0]?.status ?? "", /Waiting 7 days/);
assert.equal(desk.rows[0]?.actions.some((action) => action.type === "call"), true);
const albertDone = desk.rows[0]?.actions.find((action) => action.type === "clear");
assert.equal(albertDone?.type === "clear" ? albertDone.title : "", PROPOSAL_FOLLOW_UP_TASK);
assert.equal(albertDone?.type === "clear" ? albertDone.relatedId : "", "albert");

const overdue = desk.rows.find((row) => row.id === "task-raynor");
assert.equal(overdue?.badge, "OVERDUE");
assert.equal(overdue?.status, "Due Oct 10");
assert.ok((overdue?.age ?? 0) < (desk.rows[0]?.age ?? 0));

assert.ok(desk.rows.some((row) => row.badge === "APPROVE" && row.detail.includes("4 invoices")));
assert.ok(desk.rows.some((row) => row.badge === "PROPOSALS"));
assert.equal(desk.counts.all, desk.rows.length);
assert.ok(desk.counts.calls >= 1);
assert.ok(desk.counts.money >= 2);

const duplicate = desk.attention.find((row) => row.code === "SR100626-B");
assert.match(duplicate?.issue ?? "", /Possible duplicate of SR100626-A/);
assert.equal(duplicate?.missingAddress, true);
const mismatch = desk.attention.find((row) => row.code === "BJ100626-B");
assert.match(mismatch?.issue ?? "", /Adam Kubitz/);
assert.equal(mismatch?.action.type === "link" ? mismatch.action.label : "", "Fix customer");

assert.equal(desk.signed.percent, 12);
assert.equal(desk.signed.daysLeft, 18);
assert.match(desk.leads.sources, /Phone/);
assert.ok(desk.pipelineWarning);
assert.match(desk.pipelineWarning?.text ?? "", /far above signed work/);
assert.match(desk.pipelineWarning?.action ?? "", /Review 1 job/);

assert.equal(desk.earlier[0]?.duration, "45 min");
assert.match(desk.nowLabel, /NOW/);
assert.match(desk.laterNote ?? "", /callback list/);
assert.match(desk.tomorrow[0]?.detail ?? "", /similar tasks/);
assert.equal(desk.activity[0]?.tone, "green");

const quiet = base({
  jobs: [
    job({
      id: "booked",
      opportunityId: "sold",
      status: "in_progress",
      contractValue: 90000,
      location: "10 Oak",
      street: "10 Oak",
    }),
  ],
  opportunities: [opportunity({ id: "sold", stage: "awarded", value: 90000 })],
  signed: { amount: 90000, count: 1, avg: 90000 },
});
assert.equal(quiet.pipelineWarning, null);
assert.match(quiet.laterNote ?? "", /Nothing else on the calendar today\.$/);

function sentEstimate(jobId: string, opportunityId: string, sentAt: string): Estimate {
  return {
    id: `est-${jobId}`,
    jobId,
    opportunityId,
    status: "sent",
    archivedAt: null,
    sentAt,
    acceptedAt: null,
    taxRate: 0,
  } as Estimate;
}

const waitingJob = job({
  id: "sam",
  opportunityId: "opp-sam",
  status: "precon",
  code: "SR100126-A",
  name: "Sam Rogers",
  primaryContactId: "c-sam",
});
const waitingOpp = opportunity({ id: "opp-sam", stage: "bid_submitted" });
const waitingContact = [{ id: "c-sam", name: "Sam Rogers", phone: "2145550199" }];

function callbackDesk(tasks: Task[]) {
  return base({
    jobs: [waitingJob],
    opportunities: [waitingOpp],
    estimates: [sentEstimate("sam", "opp-sam", "2026-09-09T15:00:00")],
    tasks,
    contacts: waitingContact,
  });
}

const openCallback = callbackDesk([]);
const sam = openCallback.rows.find((row) => row.id === "callback-sam");
assert.equal(sam?.badge, "CALLBACK");
assert.equal(sam?.actions.some((action) => action.type === "clear"), true);

const clearedByFollowUp = callbackDesk([
  task({
    id: "follow",
    title: PROPOSAL_FOLLOW_UP_TASK,
    dueAt: "2026-10-13",
    completed: true,
    relatedType: "job",
    relatedId: "sam",
  }),
]);
assert.equal(clearedByFollowUp.rows.some((row) => row.id === "callback-sam"), false);

const clearedByCall = callbackDesk([
  task({
    id: "called",
    title: "Call Sam Rogers back",
    dueAt: "2026-10-12",
    completed: true,
    relatedType: "job",
    relatedId: "sam",
  }),
]);
assert.equal(clearedByCall.rows.some((row) => row.id === "callback-sam"), false);

const unrelatedDone = callbackDesk([
  task({
    id: "materials",
    title: "Order materials",
    dueAt: "2026-10-12",
    completed: true,
    relatedType: "job",
    relatedId: "sam",
  }),
]);
assert.equal(unrelatedDone.rows.some((row) => row.id === "callback-sam"), true);

const oldCall = callbackDesk([
  task({
    id: "old-call",
    title: "Call Sam Rogers back",
    dueAt: "2026-09-01",
    completed: true,
    relatedType: "job",
    relatedId: "sam",
  }),
]);
assert.equal(oldCall.rows.some((row) => row.id === "callback-sam"), true);

const closeoutJob = job({
  id: "job-co",
  opportunityId: "opp-co",
  status: "in_progress",
  code: "BJ100426-A",
  name: "Closeout house",
  location: "4020 Azure Lane",
  street: "4020 Azure Lane",
});

const openCloseout = base({
  jobs: [closeoutJob],
  opportunities: [opportunity({ id: "opp-co", stage: "awarded" })],
  tasks: [
    task({
      id: "co",
      title: "Review closeout BJ100426-A",
      dueAt: "2026-10-13",
      relatedType: "job",
      relatedId: "job-co",
    }),
  ],
  closeouts: [{ jobId: "job-co", status: "submitted" }],
});
const closeoutTask = openCloseout.rows.find((row) => row.id === "task-co");
assert.equal(closeoutTask?.badge, "CLOSEOUT");
assert.equal(closeoutTask?.titleHref, "/jobs?job=job-co&tab=closeout");
assert.equal(closeoutTask?.actions.some((action) => action.type === "done" && action.taskId === "co"), true);
assert.equal(closeoutTask?.actions.some((action) => action.type === "link" && action.label === "Review"), true);
assert.equal(openCloseout.rows.some((row) => row.id === "closeout-job-co"), false);

const finishedCloseout = base({
  jobs: [closeoutJob],
  opportunities: [opportunity({ id: "opp-co", stage: "awarded" })],
  tasks: [
    task({
      id: "co-done",
      title: "Review closeout BJ100426-A",
      dueAt: "2026-10-13",
      completed: true,
      relatedType: "job",
      relatedId: "job-co",
    }),
  ],
  closeouts: [{ jobId: "job-co", status: "submitted" }],
});
assert.equal(finishedCloseout.rows.some((row) => row.id === "task-co-done" || row.id === "closeout-job-co"), false);

const syntheticCloseout = base({
  jobs: [closeoutJob],
  opportunities: [opportunity({ id: "opp-co", stage: "awarded" })],
  closeouts: [{ jobId: "job-co", status: "submitted" }],
});
const synthetic = syntheticCloseout.rows.find((row) => row.id === "closeout-job-co");
assert.equal(synthetic?.badge, "CLOSEOUT");
assert.equal(synthetic?.titleHref, "/jobs?job=job-co&tab=closeout");
const syntheticDone = synthetic?.actions.find((action) => action.type === "clear");
assert.equal(syntheticDone?.type === "clear" ? syntheticDone.title : "", "Review closeout BJ100426-A");
assert.equal(syntheticDone?.type === "clear" ? syntheticDone.relatedId : "", "job-co");

const payoutReview = base({
  jobs: [closeoutJob],
  opportunities: [opportunity({ id: "opp-co", stage: "awarded" })],
  tasks: [
    task({
      id: "co-ready",
      title: "Ready for review BJ100426-A",
      dueAt: "2026-10-13",
      relatedType: "job",
      relatedId: "job-co",
    }),
  ],
});
const readyRow = payoutReview.rows.find((row) => row.id === "task-co-ready");
assert.equal(readyRow?.badge, "CLOSEOUT");
assert.equal(readyRow?.titleHref, "/commissions");
assert.match(readyRow?.detail ?? "", /Ready for review on Commissions/);
const readyLink = readyRow?.actions.find((action) => action.type === "link");
assert.equal(readyLink?.type === "link" ? readyLink.href : "", "/commissions");

const bdPayoutReview = base({
  jobs: [closeoutJob],
  opportunities: [opportunity({ id: "opp-co", stage: "awarded" })],
  tasks: [
    task({
      id: "co-ready",
      title: "Ready for review BJ100426-A",
      dueAt: "2026-10-13",
      relatedType: "job",
      relatedId: "job-co",
    }),
  ],
  showCommissions: false,
});
const bdReady = bdPayoutReview.rows.find((row) => row.id === "task-co-ready");
assert.equal(bdReady?.titleHref, "/jobs?job=job-co");
assert.equal(bdReady?.detail.includes("Commissions"), false);
const bdReadyLink = bdReady?.actions.find((action) => action.type === "link");
assert.equal(bdReadyLink?.type === "link" ? bdReadyLink.href : "", "/jobs?job=job-co");

console.log("home-desk tests passed");
