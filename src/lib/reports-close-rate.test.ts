import assert from "node:assert/strict";
import { buildPerformance } from "./reports.ts";
import { closingRate, type Opportunity, type StaffMember } from "./types.ts";

assert.equal(closingRate(1, 1), 0.5, "one win and one loss is 50%");
assert.equal(closingRate(1, 0), 1, "wins with no losses are 100%");
assert.equal(closingRate(0, 0), 0, "nothing decided is 0");

const viewer = {
  id: "ada",
  name: "Ada",
  title: "Owner",
  role: "company_admin",
  teamId: null,
  initials: "A",
  email: "ada@example.com",
  phone: "",
  cardSlug: "ada",
  emailSignature: "",
  locked: false,
  restricted: false,
  inviteExpiresAt: null,
  inviteToken: null,
} satisfies StaffMember;

function lead(partial: Pick<Opportunity, "id" | "stage"> & Partial<Opportunity>): Opportunity {
  return {
    code: partial.id,
    name: partial.id,
    clientId: null,
    primaryContactId: "contact",
    value: 1000,
    bidDueAt: null,
    preBidWalkAt: null,
    location: "Austin, TX",
    projectType: "roofing",
    deliveryMethod: "insurance_claim",
    estimator: "Ada",
    winProbability: 0,
    nextStep: "",
    createdAt: "2026-10-02T12:00:00.000Z",
    ownerStaffId: "ada",
    ...partial,
  };
}

const report = buildPerformance(
  {
    staff: [viewer],
    jobs: [],
    opportunities: [
      lead({ id: "won", stage: "awarded" }),
      lead({ id: "lost", stage: "lost", lostReason: "Price" }),
      lead({ id: "uq-1", stage: "unqualified" }),
      lead({ id: "uq-2", stage: "unqualified" }),
      lead({ id: "uq-3", stage: "unqualified" }),
    ],
    contacts: [],
    estimates: [],
    estimateLines: [],
    payments: [],
    expenses: [],
  },
  viewer,
  "all",
  new Date("2026-10-10T15:00:00.000Z"),
);

assert.equal(report.kpis.unqualified, 3, "unqualified leads are counted on their own");
assert.equal(report.kpis.lostCount, 1, "unqualified is not a loss");
assert.equal(report.kpis.closeRate, 0.5, "unqualified does not lower close rate");
assert.equal(report.byTeam[0]?.closeRate, 0.5, "team close rate ignores unqualified");
assert.equal(report.byTeam[0]?.lost, 1, "team lost count stays on lost");

console.log("close rate tests passed");
