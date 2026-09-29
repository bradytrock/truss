import { WORK_COLUMNS, boardCardDetails, canonicalizeWorkColumn, patchForWorkColumn, workColumnFor } from "./work-board";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const gregory = boardCardDetails({
  title: "Gregory — 9144 Shadow Ridge Drive, Highland Village, TX 75077",
  customerName: "Shawn Gregory",
  location: "9144 Shadow Ridge Drive, Highland Village, TX 75077",
  street: "9144 Shadow Ridge Drive",
});
assert(!gregory.showCustomer, "last name already in title");
assert(!gregory.showLocation, "address already in title");
assert(gregory.title === "Gregory — 9144 Shadow Ridge Drive", "street stays on the title line");
assert(gregory.streetLine === "", "street is not repeated");
assert(gregory.locality === "Highland Village, TX 75077", "city state zip drop below the street");

const distinct = boardCardDetails({
  title: "Roof replacement",
  customerName: "Shawn Gregory",
  location: "9144 Shadow Ridge Drive, Highland Village, TX 75077",
  street: "9144 Shadow Ridge Drive",
});
assert(distinct.showCustomer, "customer is extra");
assert(distinct.showLocation, "location is extra");
assert(distinct.title === "Roof replacement", "title stays the job name");
assert(distinct.streetLine === "9144 Shadow Ridge Drive", "street gets its own full line");
assert(distinct.locality === "Highland Village, TX 75077", "city state zip sit under the street");

const missing = boardCardDetails({
  title: undefined as unknown as string,
  customerName: undefined as unknown as string,
  location: undefined as unknown as string,
});
assert(missing.title === "", "nullish title does not throw");
assert(!missing.showCustomer, "nullish customer is hidden");
assert(!missing.showLocation, "nullish location is hidden");
assert(missing.streetLine === "", "nullish street is hidden");
assert(missing.locality === "", "nullish locality is hidden");

const structured = boardCardDetails({
  title: "Whitby — 100 falcon Ct, Argyle, TX 76226",
  customerName: "Whitby",
  location: "100 falcon Ct, Argyle, TX 76226",
  street: "100 falcon Ct",
  city: "Argyle",
  state: "TX",
  postalCode: "76226",
});
assert(structured.title === "Whitby — 100 falcon Ct", "structured street stays with the name");
assert(structured.locality === "Argyle, TX 76226", "structured city state zip");
assert(structured.streetLine === "", "structured street is not repeated");

const precon = { status: "precon" as const, opportunityId: "opp-1", deletedAt: null };
assert(workColumnFor(precon, { stage: "supplementing" }) === "supplementing", "supplementing stays its own column");
assert(workColumnFor(precon, { stage: "estimating" }) === "supplementing", "estimating folds into supplementing");
assert(workColumnFor(precon, { stage: "interview" }) === "proposal_sent", "follow-up still maps to proposal sent");
assert(workColumnFor(precon, { stage: "bid_submitted" }) === "proposal_sent", "proposal sent stays proposal sent");
assert(workColumnFor(precon, { stage: "awarded" }) === "in_progress", "awarded maps to in progress");
assert(
  JSON.stringify(patchForWorkColumn("supplementing")) ===
    JSON.stringify({ status: "precon", stage: "supplementing" }),
  "dragging to supplementing writes precon + supplementing",
);
assert(
  WORK_COLUMNS.indexOf("supplementing") === WORK_COLUMNS.indexOf("in_progress") + 1,
  "supplementing sits immediately behind in progress",
);
assert(!(WORK_COLUMNS as readonly string[]).includes("estimating"), "estimating is no longer its own column");
assert(canonicalizeWorkColumn("estimating") === "supplementing", "old estimating column name maps to supplementing");

console.log("work-board card tests passed");
