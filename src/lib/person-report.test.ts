import assert from "node:assert/strict";
import { buildPersonDetail } from "./person-report.ts";
import { buildPerformance, rangeForPreset, type ReportBook } from "./reports.ts";
import type { Opportunity, StaffMember } from "./types.ts";

const now = new Date("2026-11-23T15:00:00.000Z");

assert.equal(rangeForPreset("quarter", now).start, "2026-10-01");
assert.equal(rangeForPreset("quarter", now).end, "2026-11-23");

function member(partial: Pick<StaffMember, "id" | "name" | "role"> & Partial<StaffMember>): StaffMember {
  return {
    title: partial.role,
    teamId: null,
    initials: partial.name.slice(0, 1),
    email: `${partial.id}@example.com`,
    phone: "",
    cardSlug: partial.id,
    emailSignature: "",
    locked: false,
    restricted: false,
    inviteExpiresAt: null,
    inviteToken: null,
    ...partial,
  };
}

const ada = member({ id: "ada", name: "Ada", role: "company_admin" });
const maya = member({ id: "maya", name: "Maya", role: "project_manager" });
const priya = member({ id: "priya", name: "Priya", role: "business_development" });

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
    city: "Austin",
    projectType: "roofing",
    deliveryMethod: "fixed_price",
    estimator: "Maya",
    winProbability: 0,
    nextStep: "",
    createdAt: "2026-10-02T12:00:00.000Z",
    ownerStaffId: "maya",
    ...partial,
  };
}

const book: ReportBook = {
  staff: [ada, maya, priya],
  jobs: [],
  opportunities: [
    lead({ id: "won", stage: "awarded", value: 4000 }),
    lead({ id: "lost", stage: "lost", lostReason: "Price", value: 500 }),
    lead({ id: "open", stage: "estimating", nextStep: "Write the estimate" }),
    lead({ id: "sent", stage: "bid_submitted", nextStep: "Awaiting homeowner" }),
    lead({ id: "new", stage: "pursuing" }),
    lead({ id: "walk", stage: "pursuing", preBidWalkAt: "2026-10-04" }),
    lead({ id: "uq", stage: "unqualified" }),
    lead({ id: "bd", stage: "awarded", ownerStaffId: "priya", estimator: "Maya", value: 2500 }),
    lead({ id: "ada", stage: "awarded", ownerStaffId: "ada", estimator: "Ada", value: 9000 }),
  ],
  contacts: [],
  estimates: [],
  estimateLines: [],
  payments: [],
  expenses: [],
};

const report = buildPerformance(book, ada, "all", now);
const row = report.byTeam.find((item) => item.staff.id === "maya");
const detail = buildPersonDetail(book, "maya", report.range);

assert.ok(row && detail);
assert.equal(detail.won, row.won, "won count matches the leaderboard row");
assert.equal(detail.wonValue, row.wonValue, "won value matches the leaderboard row");
assert.equal(detail.lost, row.lost, "lost count matches the leaderboard row");
assert.equal(detail.qualified, row.qualified, "qualified count matches the leaderboard row");
assert.equal(detail.assigned, row.assigned, "assigned count matches the leaderboard row");
assert.equal(detail.closeRate, row.closeRate);
assert.equal(detail.qualifiedClose, row.qualifiedClose);
assert.equal(detail.avgJob, row.avgJob);

assert.equal(detail.assigned, 8, "Maya owns her leads plus the BD-originated one");
assert.equal(detail.won, 2);
assert.equal(detail.wonValue, 6500);
assert.equal(detail.inspected, 7, "a new lead with no walk is not inspected");
assert.equal(detail.qualified, 4, "awarded, estimating, proposal, and the BD win");
assert.equal(detail.proposal, 3);
assert.equal(detail.stillOpen, 2);
assert.equal(detail.unqualified, 1);
assert.equal(detail.qualifiedNoProposal, 1);
assert.equal(detail.awaitingDecision, 1);
assert.equal(detail.jobs.filter((item) => item.status === "won").length, 2);
assert.equal(
  detail.jobs.filter((item) => item.status === "won").reduce((sum, item) => sum + item.value, 0),
  detail.wonValue,
);
assert.equal(detail.openGroups.find((group) => group.id === "proposal")?.count, 1);
assert.equal(detail.openGroups.find((group) => group.id === "no_proposal")?.hint, "Write the estimate");
assert.equal(report.byTeam.some((item) => item.staff.role === "business_development"), false);

console.log("person report tests passed");
