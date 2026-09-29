import assert from "node:assert/strict";
import {
  claimTotals,
  emptyJobInsurance,
  insuranceActivityNote,
  jobInsurancePayload,
  parseChecks,
  parseSupplements,
  supplementIsOpen,
} from "./insurance.ts";
import type { JobInsurance } from "./insurance.ts";

const supplements = parseSupplements([
  { id: "s1", title: "Skylights", status: "submitted", requested: 2800, approved: 0 },
  { id: "", title: "skip" },
  "nope",
  { id: "s2", title: "Ridge vent", status: "nope", requested: "400", approved: 1800 },
]);
assert.equal(supplements.length, 2);
assert.equal(supplements[0]?.status, "submitted");
assert.equal(supplements[1]?.status, "draft");
assert.equal(supplements[1]?.requested, 400);

const checks = parseChecks([{ id: "c1", kind: "acv", payee: "mortgage", amount: "24900", reference: "4412" }]);
assert.equal(checks[0]?.kind, "acv");
assert.equal(checks[0]?.amount, 24900);
assert.equal(parseChecks({ nope: true }).length, 0);

const claim: JobInsurance = {
  ...emptyJobInsurance("job_1", "ins_1"),
  rcv: 20000,
  deductible: 1000,
  supplements: [
    {
      id: "s1",
      title: "Skylights",
      status: "submitted",
      requested: 2800,
      approved: 0,
      submittedAt: "2026-08-12",
      decidedAt: null,
      notes: "",
    },
    {
      id: "s2",
      title: "Ridge vent",
      status: "approved",
      requested: 1800,
      approved: 1600,
      submittedAt: "2026-08-01",
      decidedAt: "2026-08-20",
      notes: "",
    },
  ],
  checks: [
    {
      id: "c1",
      kind: "acv",
      payee: "mortgage",
      amount: 15000,
      receivedAt: "2026-08-22",
      reference: "4412",
      supplementId: null,
      notes: "",
    },
  ],
};

const totals = claimTotals(claim);
assert.equal(totals.approvedSupplements, 1600);
assert.equal(totals.openRequested, 2800);
assert.equal(totals.openCount, 1);
assert.equal(totals.rcvWithSupplements, 21600);
assert.equal(totals.netClaim, 20600);
assert.equal(totals.collected, 15000);
assert.equal(totals.outstanding, 5600);
assert.equal(supplementIsOpen("draft"), true);
assert.equal(supplementIsOpen("denied"), false);

const opened = insuranceActivityNote(undefined, claim);
assert.match(opened ?? "", /Opened the Insurance claim/);

const moved = insuranceActivityNote(claim, {
  ...claim,
  status: "approved",
  supplements: claim.supplements.map((item) =>
    item.id === "s1" ? { ...item, status: "partial", approved: 2100 } : item,
  ),
  checks: [
    ...claim.checks,
    {
      id: "c2",
      kind: "supplement",
      payee: "contractor",
      amount: 2100,
      receivedAt: "2026-09-01",
      reference: "8821",
      supplementId: "s1",
      notes: "",
    },
  ],
});
assert.match(moved ?? "", /Claim is approved/);
assert.match(moved ?? "", /Skylights/);
assert.match(moved ?? "", /\$2,100/);
assert.match(moved ?? "", /8821/);
assert.equal(insuranceActivityNote(claim, { ...claim, notes: "Called Al." }), null);

const payload = jobInsurancePayload(
  {
    ...emptyJobInsurance("job_1", "ins_1"),
    adjusterName: "  Al Brennan ",
    adjusterEmail: " al@summitclaims.co ",
    adjusterPhone: " (720) 555-8801 ",
  },
  "company_1",
);
assert.equal(payload.adjuster_name, "Al Brennan");
assert.equal(payload.adjuster_email, "al@summitclaims.co");
assert.equal(payload.adjuster_phone, "(720) 555-8801");
assert.equal("adjuster_contact_id" in payload, false);

console.log("insurance.test.ts ok");
