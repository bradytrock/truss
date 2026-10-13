import assert from "node:assert/strict";
import {
  buildCommissionSheet,
  canSubmitProjectCloseout,
  closeoutReleaseBlock,
  compareJobExpenses,
  closeoutPdfFilename,
  defaultCommissionSplits,
  isCommissionInYear,
  payoutRecipients,
  seedQuickbooksLines,
  splitsForViewer,
  viewerCommissionCheck,
} from "./commission-closeout.ts";
import type { Expense, ForecastedExpense, Job, Payment, StaffMember } from "./types.ts";

function job(patch: Partial<Job> = {}): Job {
  return {
    id: "job_1",
    code: "RK100126-1",
    opportunityId: null,
    name: "Keller roof",
    clientId: "client_1",
    primaryContactId: "contact_1",
    status: "punch",
    contractValue: 10000,
    startDate: "2026-09-01",
    substantialCompletion: "2026-10-01",
    superintendent: "",
    projectManager: "Ada Lopez",
    location: "100 Main St, Keller, TX",
    ownerStaffId: "staff_1",
    description: "",
    tags: [],
    street: "100 Main St",
    city: "Keller",
    state: "TX",
    postalCode: "76248",
    salesRep: "Sam Lead",
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
    ...patch,
  };
}

function payment(patch: Partial<Payment> & Pick<Payment, "id" | "amount" | "method">): Payment {
  return {
    invoiceId: null,
    jobId: "job_1",
    paidAt: "2026-10-01",
    reference: "",
    receiptUrl: "",
    receiptStoragePath: null,
    qbStatus: "entered",
    createdBy: "",
    postingStatus: "posted",
    ...patch,
  };
}

function expense(patch: Partial<Expense> & Pick<Expense, "id" | "amount" | "vendor" | "qbStatus">): Expense {
  return {
    number: patch.id,
    invoiceNumber: "",
    jobId: "job_1",
    account: "materials",
    incurredAt: "2026-10-01",
    method: "check",
    memo: "",
    receiptUrl: "",
    receiptStoragePath: null,
    extractedByAi: false,
    createdAt: "2026-10-01",
    createdBy: "",
    ...patch,
  };
}

function forecast(amount: number): ForecastedExpense {
  return {
    id: "fest_1",
    number: "FEST-1",
    jobId: "job_1",
    vendor: "Crew",
    account: "labor",
    amount,
    expectedAt: "2026-10-15",
    memo: "",
    createdAt: "2026-10-01",
    createdBy: "",
  };
}

const card = buildCommissionSheet({
  job: job(),
  payments: [payment({ id: "p1", amount: 1000, method: "credit_card" })],
  expenses: [],
  forecasts: [],
});
assert.equal(card.paymentsReceived, 1000);
assert.equal(card.merchantFees, 40);
assert.equal(card.totalPayments, 960);
assert.equal(card.payments[0]?.ccFee, 40);
assert.equal(card.payments[0]?.label, "1st payment");

const refunded = buildCommissionSheet({
  job: job(),
  payments: [
    payment({ id: "p1", amount: 500, method: "check" }),
    payment({ id: "p2", amount: 80, method: "refund" }),
  ],
  expenses: [],
  forecasts: [],
});
assert.equal(refunded.customerRefund, 80);
assert.equal(refunded.totalPayments, 420);

const empty = buildCommissionSheet({
  job: job({ contractValue: 0 }),
  payments: [],
  expenses: [],
  forecasts: [],
});
assert.equal(empty.margin, null);
assert.equal(empty.scopes[0]?.difference, null);
assert.equal(empty.costBasis, "none");
assert.equal(closeoutReleaseBlock(empty, false)?.includes("no expenses"), true);
assert.equal(closeoutReleaseBlock(empty, true), null);

const forecasted = buildCommissionSheet({
  job: job(),
  payments: [payment({ id: "p1", amount: 10000, method: "check" })],
  expenses: [],
  forecasts: [forecast(4000)],
});
assert.equal(forecasted.expensesAreForecasted, true);
assert.equal(forecasted.costBasis, "forecasted");
assert.equal(forecasted.totalExpenses, 4000);
assert.equal(forecasted.profit, 6000);
assert.equal(forecasted.estProfit, 6000);
assert.equal(forecasted.validationOnly, true);
assert.equal(forecasted.splits.find((line) => line.id === "pm")?.comm, 3000);
assert.equal(forecasted.splits.find((line) => line.id === "pm")?.check, 3000);
assert.equal(forecasted.splits.find((line) => line.id === "warranty")?.check, -50);
assert.equal(forecasted.splitTotals.comm, 3000);
assert.equal(forecasted.splitTotals.percent, 50);
assert.equal(forecasted.splitTotals.check, 2950);

const payeeSplits = defaultCommissionSplits().map((line) =>
  line.id === "pm" ? { ...line, percent: 25 } : line,
);
payeeSplits.push({ id: "extra", label: "Project Manage", percent: 25, flat: 0, trades: 0, draw: 0 });
const deducted = buildCommissionSheet({
  job: job(),
  payments: [payment({ id: "p1", amount: 10000, method: "check" })],
  expenses: [],
  forecasts: [],
  splits: payeeSplits,
});
assert.equal(deducted.profit, 10000);
assert.equal(deducted.splits.find((line) => line.id === "pm")?.comm, 2500);
assert.equal(deducted.splits.find((line) => line.id === "pm")?.check, 0);
assert.equal(deducted.splits.find((line) => line.id === "extra")?.comm, 2500);
assert.equal(deducted.splits.find((line) => line.id === "extra")?.check, 2500);
assert.equal(deducted.splitTotals.percent, 25);
assert.equal(deducted.splitTotals.comm, 2500);
assert.equal(deducted.splitTotals.check, 2450);
assert.equal(
  viewerCommissionCheck({
    splits: deducted.splits,
    viewerName: "Ada Lopez",
    viewerStaffId: "staff_1",
    projectManager: "Ada Lopez",
    ownerStaffId: "staff_1",
  }),
  0,
);
assert.equal(
  viewerCommissionCheck({
    splits: deducted.splits,
    viewerName: "Project Manage",
    projectManager: "Ada Lopez",
    ownerStaffId: "staff_1",
  }),
  2500,
);
assert.equal(
  splitsForViewer({
    splits: deducted.splits,
    viewerName: "Riley Est",
    viewerStaffId: "staff_riley",
    projectManager: "Ada Lopez",
    ownerStaffId: "staff_1",
    releasedToStaffId: "staff_riley",
    releasedToName: "Riley Est",
  }).map((line) => line.id).join(","),
  "pm",
);
assert.equal(closeoutPdfFilename("RK100126-1"), "RK100126-1 closeout.pdf");
assert.equal(closeoutPdfFilename("Job/A:1"), "Job A 1 closeout.pdf");
assert.equal(closeoutPdfFilename("   "), "Job closeout.pdf");
assert.equal(isCommissionInYear("2026-03-01T00:00:00.000Z", 2026), true);
assert.equal(isCommissionInYear("2025-12-31T00:00:00.000Z", 2026), false);
assert.equal(isCommissionInYear(null, 2026), false);

const actual = buildCommissionSheet({
  job: job(),
  payments: [payment({ id: "p1", amount: 10000, method: "check" })],
  expenses: [expense({ id: "e1", amount: 4000, vendor: "ABC Supply", qbStatus: "entered", qbTxnId: "TXN-1" })],
  forecasts: [],
  qbLines: seedQuickbooksLines([
    expense({ id: "e1", amount: 4000, vendor: "ABC Supply", qbStatus: "entered", qbTxnId: "TXN-1" }),
  ]),
});
assert.equal(actual.costBasis, "actual");
assert.equal(actual.margin, 0.6);
assert.equal(actual.compare[0]?.status, "match");
assert.equal(actual.needsAck, false);
assert.equal(closeoutReleaseBlock(actual, false), null);
assert.equal(actual.validationOnly, false);
assert.equal(defaultCommissionSplits()[0]?.percent, 50);

const differed = compareJobExpenses(
  [
    expense({ id: "e1", amount: 100, vendor: "ABC", qbStatus: "entered", invoiceNumber: "100" }),
    expense({ id: "e2", amount: 50, vendor: "Dump", qbStatus: "not_in_qb" }),
  ],
  [
    {
      id: "qb1",
      vendor: "ABC",
      amount: 80,
      txnId: "1",
      invoiceNumber: "100",
      incurredAt: "2026-10-01",
      expenseId: "e1",
    },
    {
      id: "qb2",
      vendor: "Beacon",
      amount: 75,
      txnId: "2",
      invoiceNumber: "",
      incurredAt: "2026-10-02",
      expenseId: null,
    },
  ],
);
assert.deepEqual(
  differed.map((row) => row.status),
  ["amount", "not_posted", "qb_only"],
);

const scopes = buildCommissionSheet({
  job: job({ contractValue: 12000 }),
  claim: {
    id: "claim_1",
    jobId: "job_1",
    carrier: "State Farm",
    claimNumber: "CLM",
    policyNumber: "",
    dateOfLoss: null,
    peril: "hail",
    status: "approved",
    deductible: 1000,
    rcv: 10000,
    acv: 8000,
    depreciation: 2000,
    recoverable: true,
    overheadProfit: 1500,
    mortgageCompany: "",
    loanNumber: "",
    adjusterName: "",
    adjusterEmail: "",
    adjusterPhone: "",
    notes: "",
    supplements: [],
    checks: [],
    updatedAt: "2026-10-01",
  },
  payments: [],
  expenses: [],
  forecasts: [],
});
assert.equal(scopes.scopes[0]?.isow, 10000);
assert.equal(scopes.scopes[0]?.tsow, 12000);
assert.equal(scopes.scopes[0]?.difference, 0.2);
assert.equal(scopes.scopes[0]?.zsow, 9000);
assert.equal(scopes.carrier, "State Farm");
assert.equal(scopes.overheadProfit, 1500);
assert.equal(scopes.due, 9000);

assert.equal(
  canSubmitProjectCloseout({
    role: "project_manager",
    title: "Project manager",
    viewerName: "Ada Lopez",
    viewerStaffId: "staff_ada",
    projectManager: "Someone Else",
    ownerStaffId: "staff_other",
  }),
  true,
);
assert.equal(
  canSubmitProjectCloseout({
    role: "business_development",
    title: "Business development",
    viewerName: "Sam Lead",
    viewerStaffId: "staff_sam",
    projectManager: "Sam Lead",
    ownerStaffId: "staff_other",
  }),
  true,
);
assert.equal(
  canSubmitProjectCloseout({
    role: "business_development",
    title: "Director of Business Development",
    viewerName: "Sam Lead",
    viewerStaffId: "staff_sam",
    projectManager: "Office name",
    ownerStaffId: "staff_sam",
  }),
  true,
);
assert.equal(
  canSubmitProjectCloseout({
    role: "estimator",
    title: "Project Manager",
    viewerName: "Riley Est",
    viewerStaffId: "staff_riley",
    projectManager: "Ada Lopez",
    ownerStaffId: "staff_ada",
  }),
  true,
);
assert.equal(
  canSubmitProjectCloseout({
    role: "estimator",
    title: "Estimator",
    viewerName: "Riley Est",
    viewerStaffId: "staff_riley",
    projectManager: "Ada Lopez",
    ownerStaffId: "staff_ada",
  }),
  false,
);
assert.equal(
  canSubmitProjectCloseout({
    role: "accountant",
    title: "Controller",
    viewerName: "",
    viewerStaffId: "staff_books",
    projectManager: "",
    ownerStaffId: null,
  }),
  false,
);

function staff(patch: Partial<StaffMember> & Pick<StaffMember, "id" | "name" | "role">): StaffMember {
  return {
    title: "",
    teamId: null,
    initials: "XX",
    email: "",
    phone: "",
    cardSlug: patch.id,
    emailSignature: "",
    locked: false,
    restricted: false,
    inviteExpiresAt: null,
    inviteToken: null,
    ...patch,
  };
}

const recipients = payoutRecipients(
  [
    staff({ id: "pm", name: "Ada Lopez", role: "project_manager" }),
    staff({ id: "bd", name: "Sam Lead", role: "business_development" }),
    staff({ id: "est", name: "Riley Est", role: "estimator" }),
    staff({ id: "locked", name: "Locked PM", role: "project_manager", locked: true }),
  ],
  "Office name",
  "bd",
);
assert.deepEqual(
  recipients.map((member) => member.id),
  ["pm", "bd"],
);

console.log("commission-closeout tests passed");
