import assert from "node:assert/strict";
import {
  agingBucket,
  arAging,
  collectedThisMonth,
  commissionPayout,
  commissionRows,
  completedJobsWithoutInvoice,
  expenseQbPreview,
  expenseReviewStatus,
  expensesMissingJob,
  invoiceDueLabel,
  invoiceReviewStatus,
  jobProfitRows,
  parseAccountingTab,
  parseInvoiceReviewFilter,
  reviewableExpenses,
  reviewableInvoices,
} from "./accounting-books.ts";
import { approveHref, itemKindLabel, reviewHref } from "./qb-review.ts";
import type { Expense, Invoice, InvoiceLine, Job, Payment } from "./types.ts";

function invoice(partial: Partial<Invoice> & Pick<Invoice, "id" | "number">): Invoice {
  return {
    name: partial.name ?? partial.number,
    clientId: null,
    jobId: partial.jobId ?? "job_1",
    estimateId: null,
    status: partial.status ?? "sent",
    issuedAt: partial.issuedAt ?? "2026-09-01",
    dueAt: partial.dueAt ?? null,
    notes: "",
    terms: "",
    shareToken: "",
    qbStatus: partial.qbStatus ?? "not_in_qb",
    ...partial,
  };
}

function line(invoiceId: string, unitCost: number): InvoiceLine {
  return {
    id: `line_${invoiceId}`,
    invoiceId,
    description: "Tear off",
    quantity: 1,
    unit: "LS",
    unitCost,
    sortOrder: 0,
  };
}

function job(partial: Partial<Job> & Pick<Job, "id" | "name">): Job {
  return {
    code: "J-1",
    opportunityId: null,
    clientId: null,
    primaryContactId: null,
    status: "complete",
    contractValue: 18640,
    startDate: "2026-08-01",
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
    salesRep: "Brady Jones",
    assigned: [],
    subcontractorIds: [],
    relatedContactIds: [],
    customFields: [],
    projectType: "",
    market: "residential",
    leadSource: "",
    primaryPhotoId: null,
    deletedAt: null,
    deletedReason: "",
    deletedBy: "",
    ...partial,
  } as Job;
}

assert.equal(reviewHref("invoice", "inv_1"), "/accounting?tab=review&invoice=inv_1");
assert.equal(reviewHref("expense", "ex_1"), "/accounting?tab=expenses&expense=ex_1");
assert.equal(approveHref(), "/accounting?tab=review");
assert.equal(
  itemKindLabel("expense", { kind: "expense", id: "e1", expense: { jobId: "job_1", method: "ach" } as Expense }),
  "Vendor bill",
);
assert.equal(
  itemKindLabel("expense", { kind: "expense", id: "e2", expense: { jobId: null, method: "ach" } as Expense }),
  "Vendor bill",
);
assert.equal(
  itemKindLabel("expense", { kind: "expense", id: "e3", expense: { jobId: "job_1", method: "credit_card" } as Expense }),
  "Credit card charge",
);

assert.equal(parseAccountingTab("review"), "review");
assert.equal(parseAccountingTab("expenses"), "expenses");
assert.equal(parseAccountingTab("nope"), "overview");
assert.equal(parseInvoiceReviewFilter("held"), "held");
assert.equal(parseInvoiceReviewFilter(null), "all");

assert.equal(invoiceReviewStatus(invoice({ id: "a", number: "INV-1", qbStatus: "queued" }), null), "queued");
assert.equal(invoiceReviewStatus(invoice({ id: "a", number: "INV-1", qbStatus: "returned" }), null), "held");
assert.equal(invoiceReviewStatus(invoice({ id: "a", number: "INV-1", qbStatus: "error" }), null), "needs_review");
assert.equal(invoiceReviewStatus(invoice({ id: "a", number: "INV-1" }), "Assign a job"), "needs_review");
assert.equal(invoiceReviewStatus(invoice({ id: "a", number: "INV-1" }), null), "ready");

assert.deepEqual(
  reviewableInvoices([
    invoice({ id: "draft", number: "INV-D", status: "draft" }),
    invoice({ id: "void", number: "INV-V", status: "void" }),
    invoice({ id: "in", number: "INV-E", qbStatus: "entered" }),
    invoice({ id: "open", number: "INV-1" }),
  ]).map((item) => item.id),
  ["draft", "open"],
);

assert.equal(invoiceDueLabel(invoice({ id: "a", number: "INV-1", dueAt: null })), "Due on receipt");
assert.equal(invoiceDueLabel(invoice({ id: "a", number: "INV-1", dueAt: "2026-09-15" })), "Due Sep 15, 2026");

assert.equal(agingBucket(0), "current");
assert.equal(agingBucket(12), "d1");
assert.equal(agingBucket(45), "d31");
assert.equal(agingBucket(80), "d61");
assert.equal(agingBucket(120), "d90");

const aging = arAging({
  invoices: [invoice({ id: "open", number: "INV-1", dueAt: "2099-01-01" })],
  invoiceLines: [line("open", 1000)],
  payments: [],
});
assert.equal(aging.count, 1);
assert.equal(aging.current, 1000);
assert.equal(aging.total, 1000);

const collected = collectedThisMonth(
  [
    { id: "p1", invoiceId: "open", jobId: "job_1", amount: 250, method: "check", paidAt: "2026-09-10", reference: "", receiptUrl: "", receiptStoragePath: null, qbStatus: "not_in_qb", createdBy: "" },
    { id: "p2", invoiceId: "open", jobId: "job_1", amount: 50, method: "check", paidAt: "2026-08-01", reference: "", receiptUrl: "", receiptStoragePath: null, qbStatus: "not_in_qb", createdBy: "" },
  ] satisfies Payment[],
  new Date("2026-09-15T12:00:00"),
);
assert.equal(collected.count, 1);
assert.equal(collected.amount, 250);

const missing = completedJobsWithoutInvoice(
  [job({ id: "job_1", name: "Martinez" }), job({ id: "job_2", name: "Ramirez" })],
  [invoice({ id: "open", number: "INV-1", jobId: "job_1" })],
);
assert.deepEqual(missing.map((item) => item.id), ["job_2"]);

assert.equal(
  expensesMissingJob([
    { jobId: null, qbStatus: "not_in_qb" },
    { jobId: "job_1", qbStatus: "not_in_qb" },
    { jobId: null, qbStatus: "entered" },
  ] as Expense[]).length,
  1,
);

const payout = commissionPayout(18640, 11200, "gp10");
assert.equal(payout.profit, 7440);
assert.equal(payout.payout, 744);

const profits = jobProfitRows({
  jobs: [job({ id: "job_1", name: "Martinez", contractValue: 18640 })],
  invoices: [invoice({ id: "open", number: "INV-1", jobId: "job_1" })],
  invoiceLines: [line("open", 18640)],
  payments: [],
  expenses: [{ id: "e1", number: "EX-1", jobId: "job_1", vendor: "ABC", account: "materials", amount: 11200, incurredAt: "2026-09-01", method: "check", memo: "", receiptUrl: "", receiptStoragePath: null, qbStatus: "entered", extractedByAi: false, createdAt: "2026-09-01", createdBy: "" }],
  basis: "accrual",
});
assert.equal(profits.length, 1);
assert.equal(profits[0]?.profit, 7440);
assert.equal(commissionRows(profits)[0]?.payout, 744);

const bill = {
  id: "e-review",
  number: "EX-104",
  jobId: "job_1",
  vendor: "ABC Supply",
  account: "materials",
  amount: 842.15,
  incurredAt: "2026-09-12",
  method: "credit_card",
  memo: "Ridge vent",
  receiptUrl: "https://files.example/receipt.pdf",
  receiptStoragePath: null,
  qbStatus: "not_in_qb",
  extractedByAi: false,
  createdAt: "2026-09-12",
  createdBy: "",
} as Expense;

assert.equal(expenseReviewStatus(bill, null), "ready");
assert.equal(expenseReviewStatus({ ...bill, qbStatus: "returned" }, null), "held");
assert.equal(expenseReviewStatus({ ...bill, qbStatus: "error" }, null), "needs_review");
assert.deepEqual(
  reviewableExpenses([bill, { ...bill, id: "in", qbStatus: "entered" }]).map((item) => item.id),
  ["e-review"],
);
const preview = expenseQbPreview(bill, job({ id: "job_1", name: "Martinez", code: "J-12" }), "Martinez");
assert.equal(preview.txnType, "Credit card charge");
assert.equal(preview.vendor, "ABC Supply");
assert.equal(preview.accountName, "Job materials");
assert.equal(preview.customerJob, "Martinez:J-12");
assert.equal(preview.memo, "Ridge vent");

const achPreview = expenseQbPreview(
  { ...bill, method: "ach" },
  job({ id: "job_1", name: "Martinez", code: "J-12" }),
  "Martinez",
);
assert.equal(achPreview.txnType, "Vendor bill");
assert.equal(achPreview.customerJob, "Martinez:J-12");
assert.equal(achPreview.payAccount, "Accounts Payable");

const jobCheckPreview = expenseQbPreview(
  { ...bill, method: "check" },
  job({ id: "job_1", name: "Martinez", code: "J-12" }),
  "Martinez",
);
assert.equal(jobCheckPreview.txnType, "Vendor bill");
assert.equal(jobCheckPreview.customerJob, "Martinez:J-12");

const overheadCheck = expenseQbPreview({ ...bill, method: "check", jobId: null }, null);
assert.equal(overheadCheck.txnType, "Vendor bill");
assert.equal(overheadCheck.payAccount, "Accounts Payable");

console.log("accounting-books tests passed");
