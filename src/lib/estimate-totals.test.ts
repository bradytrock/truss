import assert from "node:assert/strict";
import { featuredEstimateForJob, estimateTotals, toClientFacingProposal } from "./estimate-totals.ts";
import type { Estimate } from "./types.ts";

const estimate = {
  taxRate: 0,
  discountKind: "percent" as const,
  discountValue: 0,
  depositKind: "percent" as const,
  depositValue: 0,
  marginPercent: 20,
  subtotalOverride: null as number | null,
};

const lines = [
  {
    quantity: 1,
    unitCost: 1000,
    optional: false,
    selected: true,
    taxable: true,
    package: "" as const,
  },
];

const office = estimateTotals(estimate, lines);
assert.equal(office.lineSubtotal, 1000);
assert.equal(office.marginAmount, 200);
assert.equal(office.subtotal, 1200);
assert.equal(office.marginPercent, 20);

const client = toClientFacingProposal(estimate, lines);
assert.equal(client.estimate.marginPercent, 0);
assert.equal(client.lines[0]?.unitCost, 1200);
const shown = estimateTotals(client.estimate, client.lines);
assert.equal(shown.marginAmount, 0);
assert.equal(shown.marginPercent, 0);
assert.equal(shown.subtotal, 1200);
assert.equal(shown.total, 1200);

const lump = toClientFacingProposal({ ...estimate, subtotalOverride: 5000 }, lines);
assert.equal(lump.estimate.marginPercent, 0);
assert.equal(lump.lines[0]?.unitCost, 1000);
assert.equal(estimateTotals(lump.estimate, lump.lines).subtotal, 5000);

const sharePage = toClientFacingProposal(
  { ...estimate, marginPercent: 30 },
  [{ ...lines[0]!, quantity: 26, unitCost: 900 }],
);
assert.equal(sharePage.estimate.marginPercent, 0);
const shareTotals = estimateTotals(sharePage.estimate, sharePage.lines);
assert.equal(shareTotals.lineSubtotal, 30420);
assert.equal(shareTotals.marginAmount, 0);
assert.equal(shareTotals.subtotal, 30420);

function estimateRow(partial: Partial<Estimate> & Pick<Estimate, "id" | "status">): Estimate {
  return {
    number: partial.number ?? partial.id,
    name: partial.name ?? partial.id,
    clientId: null,
    opportunityId: null,
    jobId: "job_1",
    contactId: null,
    secondContactId: null,
    notes: "",
    validUntil: null,
    sentAt: null,
    acceptedAt: null,
    secondAcceptedAt: null,
    ownerSignedAt: null,
    ownerSignedName: "",
    createdAt: "2026-09-01T00:00:00.000Z",
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

const draft = estimateRow({ id: "est_draft", number: "EST-1021", status: "draft" });
const signed = estimateRow({
  id: "est_signed",
  number: "EST-1018",
  status: "accepted",
  acceptedAt: "2026-09-10T00:00:00.000Z",
});
const featured = featuredEstimateForJob([draft, signed]);
assert.equal(featured?.id, "est_signed");
assert.equal(featuredEstimateForJob([draft])?.id, "est_draft");
assert.equal(featuredEstimateForJob([draft, { ...signed, archivedAt: "2026-09-16T00:00:00.000Z" }])?.id, "est_draft");

console.log("estimate-totals.test.ts ok");
