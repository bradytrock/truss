import assert from "node:assert/strict";
import { formatDate } from "./format.ts";
import {
  applyForecastedExpenses,
  buildProfitAndLoss,
  compareJobProfitAndLoss,
  preferredEstimateForJob,
  type ProfitAndLossStatement,
} from "./profit-and-loss.ts";
import type {
  CatalogItem,
  Estimate,
  EstimateLine,
  Expense,
  ForecastedExpense,
  Invoice,
  InvoiceLine,
  Job,
  Payment,
} from "./types.ts";

function estimate(partial: Partial<Estimate> & Pick<Estimate, "id" | "status">): Estimate {
  return {
    number: "EST-1",
    name: "Roof",
    clientId: null,
    opportunityId: "opp1",
    jobId: "job1",
    contactId: null,
    secondContactId: null,
    notes: "",
    validUntil: null,
    sentAt: null,
    acceptedAt: null,
    secondAcceptedAt: null,
    ownerSignedAt: null,
    ownerSignedName: "",
    createdAt: "2026-09-01",
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
    ...partial,
  };
}

function line(partial: Partial<EstimateLine> & Pick<EstimateLine, "id" | "unitCost" | "quantity">): EstimateLine {
  return {
    estimateId: "est1",
    catalogItemId: null,
    title: "Shingles",
    description: "",
    unit: "SQ",
    sortOrder: 0,
    groupName: "",
    optional: false,
    selected: true,
    taxable: false,
    package: "",
    photoIds: [],
    ...partial,
  };
}

const statement: Pick<
  ProfitAndLossStatement,
  "income" | "costOfSales" | "expenses" | "otherExpenses" | "grossProfit" | "netIncome"
> = {
  income: { id: "income", label: "Income", totalLabel: "Total Income", emptyLine: "", lines: [], total: 9000 },
  costOfSales: { id: "cos", label: "COS", totalLabel: "Total COS", emptyLine: "", lines: [], total: 6200 },
  expenses: { id: "expenses", label: "Exp", totalLabel: "Total Exp", emptyLine: "", lines: [], total: 200 },
  otherExpenses: { id: "other", label: "Other", totalLabel: "Total Other", emptyLine: "", lines: [], total: 0 },
  grossProfit: 2800,
  netIncome: 2600,
};

const accepted = estimate({ id: "est1", status: "accepted", number: "EST-1016" });
const draft = estimate({ id: "est2", status: "draft", number: "EST-1017" });
assert.equal(preferredEstimateForJob({ id: "job1", opportunityId: "opp1" }, [draft, accepted])?.id, "est1");

const catalog: CatalogItem[] = [
  {
    id: "cat1",
    name: "TAMKO",
    description: "",
    kind: "material",
    unit: "SQ",
    unitCost: 80,
    marginPercent: 40,
    costCode: "MAT",
  },
];

const compared = compareJobProfitAndLoss({
  job: { id: "job1", opportunityId: "opp1", contractValue: 0 },
  statement,
  estimates: [accepted],
  estimateLines: [
    line({ id: "l1", catalogItemId: "cat1", quantity: 50, unitCost: 112 }),
    line({ id: "l2", catalogItemId: null, quantity: 1, unitCost: 400 }),
  ],
  catalog,
});

assert.ok(compared);
assert.equal(compared?.projectedIncome, 50 * 112 + 400);
assert.equal(compared?.projectedCostOfSales, 50 * 80 + 400);
assert.equal(compared?.projectedGrossProfit, 50 * 112 + 400 - (50 * 80 + 400));
assert.equal(compared?.estimateLabel?.startsWith("EST-1016"), true);

const contractOnly = compareJobProfitAndLoss({
  job: { id: "job2", opportunityId: null, contractValue: 15000 },
  statement,
  estimates: [],
  estimateLines: [],
});
assert.equal(contractOnly?.projectedIncome, 15000);
assert.equal(contractOnly?.projectedCostOfSales, null);
assert.equal(contractOnly?.projectedNetIncome, null);

assert.equal(
  compareJobProfitAndLoss({
    job: { id: "job3", opportunityId: null, contractValue: 0 },
    statement,
    estimates: [],
    estimateLines: [],
  }),
  null,
);

const forecast: ForecastedExpense = {
  id: "fest1",
  number: "FEST-1001",
  jobId: "job1",
  vendor: "Front Range Roll-Off",
  account: "dumpsters",
  amount: 700,
  expectedAt: "2026-09-02",
  memo: "Second box",
  createdAt: "2026-08-20T15:00:00.000Z",
  createdBy: "Nora Keene",
};
const withForecast = applyForecastedExpenses(compared, [forecast]);
assert.equal(withForecast?.projectedCostOfSales, 50 * 80 + 400 + 700);
assert.equal(withForecast?.projectedExpenses, 0);
assert.equal(withForecast?.projectedGrossProfit, (50 * 112 + 400) - (50 * 80 + 400 + 700));
assert.equal(applyForecastedExpenses(null, [forecast]), null);
assert.equal(applyForecastedExpenses(compared, []), compared);

const contractWithForecast = applyForecastedExpenses(contractOnly, [forecast]);
assert.equal(contractWithForecast?.projectedCostOfSales, null);
assert.equal(contractWithForecast?.projectedNetIncome, null);

const officeForecast: ForecastedExpense = { ...forecast, id: "fest2", account: "fuel", amount: 120 };
const withOffice = applyForecastedExpenses(compared, [officeForecast]);
assert.equal(withOffice?.projectedCostOfSales, 50 * 80 + 400);
assert.equal(withOffice?.projectedExpenses, 120);
assert.equal(withOffice?.projectedNetIncome, (50 * 112 + 400) - (50 * 80 + 400) - 120);

function job(partial: Partial<Job> & Pick<Job, "id" | "name">): Job {
  return {
    code: partial.id,
    opportunityId: null,
    clientId: null,
    primaryContactId: null,
    status: "in_progress",
    contractValue: 0,
    startDate: "2026-09-01",
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

function invoice(partial: Partial<Invoice> & Pick<Invoice, "id" | "number">): Invoice {
  return {
    name: partial.name ?? "",
    clientId: null,
    jobId: partial.jobId ?? null,
    estimateId: null,
    status: partial.status ?? "sent",
    issuedAt: partial.issuedAt ?? "2026-09-04",
    dueAt: null,
    notes: "",
    terms: "",
    shareToken: "",
    qbStatus: "not_in_qb",
    ...partial,
  };
}

function invoiceLine(invoiceId: string, unitCost: number, id = `line_${invoiceId}`): InvoiceLine {
  return { id, invoiceId, description: "Work", quantity: 1, unit: "LS", unitCost, sortOrder: 0 };
}

function payment(partial: Partial<Payment> & Pick<Payment, "id" | "amount" | "paidAt">): Payment {
  return {
    invoiceId: partial.invoiceId ?? null,
    jobId: partial.jobId ?? null,
    method: partial.method ?? "check",
    reference: partial.reference ?? "",
    receiptUrl: "",
    receiptStoragePath: null,
    qbStatus: "not_in_qb",
    createdBy: "",
    ...partial,
  };
}

function expense(partial: Partial<Expense> & Pick<Expense, "id" | "amount" | "account">): Expense {
  return {
    number: partial.number ?? partial.id.toUpperCase(),
    invoiceNumber: partial.invoiceNumber ?? "",
    jobId: partial.jobId ?? null,
    vendor: partial.vendor ?? "Vendor",
    incurredAt: partial.incurredAt ?? "2026-09-02",
    method: partial.method ?? "check",
    memo: "",
    receiptUrl: "",
    receiptStoragePath: null,
    qbStatus: "not_in_qb",
    extractedByAi: false,
    createdAt: "2026-09-02T12:00:00.000Z",
    createdBy: "",
    ...partial,
  };
}

const falcon = job({ id: "job_falcon", name: "EST-1057 · 100 Falcon Ct" });
const hart = job({ id: "job_hart", name: "Hart water" });
const books = {
  companyName: "Northline",
  jobs: [falcon, hart],
  invoices: [
    invoice({ id: "inv_late", number: "INV-199", name: "Draw 2", jobId: falcon.id, issuedAt: "2026-09-10" }),
    invoice({ id: "inv_early", number: "INV-200", name: "Draw 1", jobId: falcon.id, issuedAt: "2026-09-04" }),
    invoice({ id: "inv_draft", number: "INV-DRAFT", name: "Draft", jobId: falcon.id, status: "draft" }),
    invoice({ id: "inv_other", number: "INV-9", name: "Loose bill", jobId: null, issuedAt: "2026-09-12" }),
    invoice({ id: "inv_old", number: "INV-1", name: "August", jobId: falcon.id, issuedAt: "2026-08-02" }),
  ],
  invoiceLines: [
    invoiceLine("inv_late", 400),
    invoiceLine("inv_early", 100),
    invoiceLine("inv_draft", 999),
    invoiceLine("inv_other", 50),
    invoiceLine("inv_old", 80),
  ],
  payments: [
    payment({ id: "pay_1", amount: 60, paidAt: "2026-09-15", invoiceId: "inv_early", reference: "4419" }),
    payment({ id: "pay_loose", amount: 15, paidAt: "2026-09-16", method: "cash" }),
    payment({ id: "pay_old", amount: 80, paidAt: "2026-08-03", invoiceId: "inv_old", jobId: falcon.id }),
  ],
  expenses: [
    expense({
      id: "exp_mat",
      amount: 80,
      account: "materials",
      jobId: falcon.id,
      vendor: "ABC Supply",
      invoiceNumber: "S1044821",
      incurredAt: "2026-09-02",
    }),
    expense({
      id: "exp_hd",
      amount: 20,
      account: "materials",
      jobId: falcon.id,
      vendor: "Home Depot",
      incurredAt: "2026-09-18",
      number: "EXP-4003",
    }),
    expense({
      id: "exp_sub",
      amount: 300,
      account: "subcontractors",
      jobId: hart.id,
      vendor: "Peak Roofing",
      invoiceNumber: "PR-12",
      incurredAt: "2026-09-08",
    }),
    expense({
      id: "exp_fuel",
      amount: 40,
      account: "fuel",
      jobId: null,
      vendor: "Shell",
      incurredAt: "2026-09-03",
      number: "EXP-FUEL",
    }),
    expense({
      id: "exp_old",
      amount: 500,
      account: "materials",
      jobId: falcon.id,
      vendor: "Old Yard",
      invoiceNumber: "OLD",
      incurredAt: "2026-08-01",
    }),
  ],
  estimates: [] as Estimate[],
  estimateLines: [] as EstimateLine[],
  from: "2026-09-01",
  to: "2026-09-30",
  periodLabel: "September 2026",
};

const accrual = buildProfitAndLoss({ ...books, basis: "accrual" });
const falconIncome = accrual.income.lines.find((line) => line.id === falcon.id);
assert.equal(falconIncome?.amount, 500);
assert.deepEqual(
  falconIncome?.children?.map((line) => line.label),
  [
    `${formatDate("2026-09-04")} · INV-200 · Draw 1`,
    `${formatDate("2026-09-10")} · INV-199 · Draw 2`,
  ],
);
assert.equal(
  falconIncome?.children?.reduce((sum, line) => sum + line.amount, 0),
  falconIncome?.amount,
);
assert.equal(falconIncome?.children?.some((line) => line.id === "inv_draft"), false);
assert.equal(falconIncome?.children?.[0].href, "/invoices/inv_early");
const otherIncome = accrual.income.lines.find((line) => line.id === "other-income");
assert.equal(otherIncome?.amount, 50);
assert.equal(otherIncome?.children?.[0].label, `${formatDate("2026-09-12")} · INV-9 · Loose bill`);

const materials = accrual.costOfSales.lines.find((line) => line.id === "materials");
assert.equal(materials?.amount, 100);
assert.deepEqual(
  materials?.children?.map((line) => line.label),
  [
    `${formatDate("2026-09-02")} · EST-1057 · 100 Falcon Ct · ABC Supply · invoice S1044821`,
    `${formatDate("2026-09-18")} · EST-1057 · 100 Falcon Ct · Home Depot · EXP-4003`,
  ],
);
assert.equal(materials?.children?.[0].href, "/jobs?job=job_falcon&tab=files&doc=expense%3Aexp_mat");
const subs = accrual.costOfSales.lines.find((line) => line.id === "subcontractors");
assert.match(subs?.children?.[0].label ?? "", /Hart water · Peak Roofing · invoice PR-12/);
const fuel = accrual.expenses.lines.find((line) => line.id === "fuel");
assert.equal(fuel?.children?.[0].label, `${formatDate("2026-09-03")} · Shell · EXP-FUEL`);
assert.equal(accrual.costOfSales.total, 400);
assert.equal(accrual.grossProfit, accrual.income.total - accrual.costOfSales.total);

const jobBooks = buildProfitAndLoss({
  ...books,
  basis: "accrual",
  job: falcon,
  from: null,
  to: null,
  periodLabel: "Job",
});
assert.deepEqual(
  jobBooks.income.lines.map((line) => line.label),
  ["INV-1 · August", "INV-200 · Draw 1", "INV-199 · Draw 2"],
);
assert.equal(jobBooks.income.lines.every((line) => !line.children), true);
const jobMaterials = jobBooks.costOfSales.lines.find((line) => line.id === "materials");
const abc = jobMaterials?.children?.find((line) => line.id === "exp_mat");
assert.equal(abc?.label.includes("Falcon"), false);
assert.match(abc?.label ?? "", /ABC Supply · invoice S1044821/);
assert.equal(jobMaterials?.amount, 600);

const cash = buildProfitAndLoss({ ...books, basis: "cash" });
const cashFalcon = cash.income.lines.find((line) => line.id === falcon.id);
assert.equal(cashFalcon?.amount, 60);
assert.equal(cashFalcon?.children?.[0].label, `${formatDate("2026-09-15")} · INV-200 · check · 4419`);
assert.equal(cashFalcon?.children?.[0].href, "/invoices/inv_early");
const unapplied = cash.income.lines.find((line) => line.id === "unapplied");
assert.equal(unapplied?.amount, 15);
assert.match(unapplied?.children?.[0].label ?? "", /Payment · cash/);

const jobCash = buildProfitAndLoss({
  ...books,
  basis: "cash",
  job: falcon,
  from: null,
  to: null,
  periodLabel: "Job",
});
assert.deepEqual(
  jobCash.income.lines.map((line) => line.label),
  ["INV-1 · check", "INV-200 · check · 4419"],
);
assert.equal(jobCash.income.lines.every((line) => !line.children), true);

console.log("profit-and-loss.test.ts ok");
