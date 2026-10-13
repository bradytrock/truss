import assert from "node:assert/strict";
import { pipelinePathTotals, unweightedContractValue } from "./pipeline-path.ts";
import type { Estimate, EstimateLine, Job, Opportunity } from "./types.ts";

function opportunity(partial: Pick<Opportunity, "id" | "stage"> & Partial<Opportunity>): Opportunity {
  return {
    code: partial.id,
    name: partial.id,
    clientId: null,
    primaryContactId: "contact",
    value: 0,
    bidDueAt: null,
    preBidWalkAt: null,
    location: "Flower Mound, TX",
    projectType: "roofing",
    market: "residential",
    deliveryMethod: "negotiated",
    estimator: "Ada",
    winProbability: 15,
    nextStep: "",
    createdAt: "2026-10-01T12:00:00.000Z",
    ownerStaffId: "ada",
    ...partial,
  };
}

function job(partial: Pick<Job, "id" | "opportunityId" | "status"> & Partial<Job>): Job {
  return {
    code: partial.id,
    name: partial.id,
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

function estimate(
  partial: Pick<Estimate, "id" | "opportunityId" | "status"> & Partial<Estimate>,
): Estimate {
  return {
    number: partial.id,
    name: partial.id,
    clientId: null,
    jobId: null,
    contactId: null,
    secondContactId: null,
    notes: "",
    validUntil: null,
    sentAt: null,
    acceptedAt: null,
    secondAcceptedAt: null,
    ownerSignedAt: null,
    ownerSignedName: "",
    createdAt: "2026-10-01T12:00:00.000Z",
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
    selectedPackage: "",
    marginPercent: 0,
    subtotalOverride: null,
    hideLinePrices: false,
    contractTypeId: null,
    ...partial,
  };
}

function line(estimateId: string, unitCost: number, id = `${estimateId}-line`): EstimateLine {
  return {
    id,
    estimateId,
    catalogItemId: null,
    title: "Roof",
    description: "",
    quantity: 1,
    unit: "ea",
    unitCost,
    sortOrder: 0,
    groupName: "",
    optional: false,
    selected: true,
    taxable: false,
    package: "",
    photoIds: [],
  };
}

const lead = opportunity({ id: "lead", stage: "pursuing", value: 0, winProbability: 15 });
const proposal = opportunity({ id: "proposal", stage: "bid_submitted", value: 0, winProbability: 45 });
const followUp = opportunity({ id: "follow", stage: "interview", value: 4000 });
const supplement = opportunity({ id: "supp", stage: "supplementing", value: 0 });
const estimating = opportunity({ id: "est-stage", stage: "estimating", value: 900 });
const producing = opportunity({ id: "prod", stage: "supplementing", value: 100 });
const sold = opportunity({ id: "sold", stage: "awarded", value: 50000 });

const rows = pipelinePathTotals({
  jobs: [
    job({ id: "job-lead", opportunityId: "lead", status: "precon" }),
    job({ id: "job_lead_dup", opportunityId: "lead", status: "precon", contractValue: 1 }),
    job({ id: "job-proposal", opportunityId: "proposal", status: "precon" }),
    job({ id: "job-follow", opportunityId: "follow", status: "precon" }),
    job({ id: "job-supp", opportunityId: "supp", status: "precon" }),
    job({ id: "job-est", opportunityId: "est-stage", status: "precon" }),
    job({
      id: "job-prod",
      opportunityId: "prod",
      status: "in_progress",
      contractValue: 7894.94,
    }),
    job({ id: "job-sold", opportunityId: "sold", status: "precon", contractValue: 27000 }),
    job({ id: "job-gone", opportunityId: "gone", status: "precon", contractValue: 8000, deletedAt: "2026-10-02" }),
    job({ id: "job-done", opportunityId: null, status: "complete", contractValue: 12000 }),
  ],
  opportunities: [
    lead,
    proposal,
    followUp,
    supplement,
    estimating,
    producing,
    sold,
    opportunity({ id: "orphan", stage: "pursuing", value: 0 }),
    opportunity({ id: "gone", stage: "pursuing", value: 8000 }),
  ],
  estimates: [
    estimate({ id: "lead-draft", opportunityId: "lead", status: "draft", createdAt: "2026-10-02T00:00:00.000Z" }),
    estimate({
      id: "lead-empty",
      opportunityId: "lead",
      status: "draft",
      createdAt: "2026-10-03T00:00:00.000Z",
    }),
    estimate({
      id: "proposal-draft",
      opportunityId: "proposal",
      status: "draft",
      createdAt: "2026-10-01T00:00:00.000Z",
      subtotalOverride: 19828.55,
    }),
    estimate({
      id: "proposal-viewed",
      opportunityId: "proposal",
      status: "viewed",
      sentAt: "2026-10-04T00:00:00.000Z",
      createdAt: "2026-10-03T00:00:00.000Z",
      subtotalOverride: 3380,
    }),
    estimate({
      id: "proposal-declined",
      opportunityId: "proposal",
      status: "declined",
      subtotalOverride: 49500,
    }),
    estimate({ id: "supp-viewed", opportunityId: "supp", status: "viewed", subtotalOverride: 3760.28 }),
    estimate({ id: "supp-draft", opportunityId: "supp", status: "draft", subtotalOverride: 90000 }),
    estimate({ id: "orphan-draft", opportunityId: "orphan", status: "draft", subtotalOverride: 164.29 }),
    estimate({
      id: "sold-bigger",
      opportunityId: "sold",
      status: "draft",
      subtotalOverride: 99000,
    }),
  ],
  lines: [line("lead-draft", 12500), line("lead-empty", 0)],
});

const valueOf = (column: string) => rows.find((row) => row.column === column)?.value ?? -1;

assert.deepEqual(
  rows.map((row) => row.column),
  ["lead", "proposal_sent", "in_progress", "supplementing", "punch", "on_hold"],
);
assert.equal(valueOf("lead"), 12664.29, "lead uses the priced draft, not win probability or a zero opportunity value");
assert.equal(valueOf("proposal_sent"), 7380, "proposal sent uses the viewed proposal and folds follow-up into that column");
assert.equal(valueOf("supplementing"), 4660.28, "estimating sits with supplementing, and a later draft does not replace a sent proposal");
assert.equal(valueOf("in_progress"), 34894.94, "in-progress work stays in progress even when the lead stage is still supplementing");
assert.equal(valueOf("lead"), 12664.29, "a deleted card is not added back from its lead");
assert.equal(valueOf("punch"), 0);
assert.equal(valueOf("on_hold"), 0);
assert.ok(!rows.some((row) => row.label === "Follow-up"));

assert.equal(
  unweightedContractValue({
    job: job({ id: "job-prod", opportunityId: "prod", status: "in_progress", contractValue: 7894.94 }),
    opportunity: producing,
    estimates: [estimate({ id: "bigger", opportunityId: "prod", status: "draft", subtotalOverride: 20000 })],
    lines: [],
  }),
  7894.94,
  "a saved contract is the amount, not a larger unsigned draft",
);

console.log("pipeline-path.test.ts ok");
