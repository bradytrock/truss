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

const closer = {
  ...viewer,
  id: "maya",
  name: "Maya",
  title: "Project manager",
  role: "project_manager",
  initials: "M",
  email: "maya@example.com",
  cardSlug: "maya",
} satisfies StaffMember;

const bd = {
  ...viewer,
  id: "priya",
  name: "Priya",
  title: "Director of Business Development",
  role: "business_development",
  initials: "P",
  email: "priya@example.com",
  cardSlug: "priya",
} satisfies StaffMember;

const withBd = buildPerformance(
  {
    staff: [viewer, closer, bd],
    jobs: [],
    opportunities: [
      lead({ id: "bd-owned", stage: "awarded", ownerStaffId: "priya", estimator: "Maya" }),
      lead({ id: "bd-only", stage: "awarded", ownerStaffId: "priya", estimator: "Priya" }),
      lead({ id: "closer-owned", stage: "awarded", ownerStaffId: "maya", estimator: "Priya" }),
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

assert.equal(
  withBd.byTeam.some((row) => row.staff.role === "business_development"),
  false,
  "business development stays off the team leaderboard",
);
assert.equal(withBd.byTeam.find((row) => row.staff.id === "maya")?.won, 2, "the closer keeps one copy of BD-owned work");
assert.equal(withBd.highlights.topCloser?.staff.role === "business_development", false);

console.log("close rate tests passed");
