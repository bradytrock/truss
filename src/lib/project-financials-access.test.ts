import assert from "node:assert/strict";
import { jobSoldAmount } from "./estimate-totals.ts";
import { canViewProjectFinancials } from "./visibility.ts";
import type { Estimate, EstimateLine, SeatRole } from "./types.ts";

const roles: SeatRole[] = [
  "company_admin",
  "director",
  "business_development",
  "team_lead",
  "team_admin",
  "project_manager",
  "estimator",
  "superintendent",
  "accountant",
];

for (const role of roles) {
  assert.equal(canViewProjectFinancials(role), role !== "business_development", role);
}
assert.equal(canViewProjectFinancials(undefined), false);

function estimate(patch: Partial<Estimate> & Pick<Estimate, "id" | "status">): Estimate {
  return {
    companyId: "co",
    number: "EST-1",
    name: "Roof",
    clientId: "client",
    jobId: "job",
    opportunityId: "opp",
    status: patch.status,
    taxRate: 0,
    discountKind: "amount",
    discountValue: 0,
    depositKind: "amount",
    depositValue: 0,
    notes: "",
    createdAt: "2026-01-01",
    sentAt: null,
    acceptedAt: patch.acceptedAt ?? null,
    signatureName: "",
    signatureImage: "",
    secondContactId: "",
    secondAcceptedAt: null,
    secondSignatureName: "",
    secondSignatureImage: "",
    archivedAt: patch.archivedAt ?? null,
    subtotalOverride: patch.subtotalOverride ?? null,
    marginPercent: 0,
    packageMode: "",
    selectedPackage: "",
    ...patch,
  };
}

function line(estimateId: string, unitCost: number): EstimateLine {
  return {
    id: `line-${estimateId}`,
    estimateId,
    catalogItemId: "",
    title: "Roof",
    description: "",
    quantity: 1,
    unitCost,
    unit: "ea",
    optional: false,
    selected: true,
    taxable: false,
    sortOrder: 0,
    package: "",
    photoIds: [],
  };
}

const signed = estimate({ id: "signed", status: "accepted", acceptedAt: "2026-02-01", subtotalOverride: 18400 });
const draft = estimate({ id: "draft", status: "draft", subtotalOverride: 9000 });

assert.equal(
  jobSoldAmount(
    { id: "job", opportunityId: "opp", contractValue: 12000, market: "residential" },
    [signed, draft],
    [line("signed", 1), line("draft", 1)],
  ),
  18400,
);

assert.equal(
  jobSoldAmount(
    { id: "job", opportunityId: "opp", contractValue: 12000, market: "residential" },
    [draft],
    [line("draft", 1)],
  ),
  12000,
);

assert.equal(
  jobSoldAmount(
    { id: "job", opportunityId: "opp", contractValue: 0, market: "residential" },
    [draft],
    [line("draft", 1)],
  ),
  0,
);
