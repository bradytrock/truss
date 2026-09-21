import assert from "node:assert/strict";
import {
  compareJobProfitAndLoss,
  preferredEstimateForJob,
  type ProfitAndLossStatement,
} from "./profit-and-loss.ts";
import type { CatalogItem, Estimate, EstimateLine } from "./types.ts";

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

console.log("profit-and-loss.test.ts ok");
