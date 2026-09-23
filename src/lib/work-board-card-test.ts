import { boardCardDetails, patchForWorkColumn, workColumnFor } from "./work-board";

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

const distinct = boardCardDetails({
  title: "Roof replacement",
  customerName: "Shawn Gregory",
  location: "9144 Shadow Ridge Drive, Highland Village, TX 75077",
  street: "9144 Shadow Ridge Drive",
});
assert(distinct.showCustomer, "customer is extra");
assert(distinct.showLocation, "location is extra");

const missing = boardCardDetails({
  title: undefined as unknown as string,
  customerName: undefined as unknown as string,
  location: undefined as unknown as string,
});
assert(missing.title === "", "nullish title does not throw");
assert(!missing.showCustomer, "nullish customer is hidden");
assert(!missing.showLocation, "nullish location is hidden");

const precon = { status: "precon" as const, opportunityId: "opp-1", deletedAt: null };
assert(workColumnFor(precon, { stage: "supplementing" }) === "supplementing", "supplementing stays its own column");
assert(workColumnFor(precon, { stage: "interview" }) === "proposal_sent", "follow-up still maps to proposal sent");
assert(workColumnFor(precon, { stage: "bid_submitted" }) === "proposal_sent", "proposal sent stays proposal sent");
assert(workColumnFor(precon, { stage: "awarded" }) === "in_progress", "awarded maps to in progress");
assert(
  JSON.stringify(patchForWorkColumn("supplementing")) ===
    JSON.stringify({ status: "precon", stage: "supplementing" }),
  "dragging to supplementing writes precon + supplementing",
);

console.log("work-board card tests passed");
