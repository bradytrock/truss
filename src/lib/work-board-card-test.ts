import {
  WORK_COLUMNS,
  boardCardAddress,
  boardCardCue,
  boardCardDetails,
  boardCardName,
  canonicalizeWorkColumn,
  isShelvedWorkColumn,
  patchForWorkColumn,
  workColumnFor,
} from "./work-board";

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
assert(workColumnFor(precon, { stage: "unqualified" }) === "unqualified", "unqualified is its own column");
assert(workColumnFor({ ...precon, deletedAt: "2026-01-01" }, { stage: "unqualified" }) === "deleted", "delete still wins over unqualified");
assert(
  JSON.stringify(patchForWorkColumn("unqualified")) ===
    JSON.stringify({ status: "on_hold", stage: "unqualified" }),
  "unqualified parks the job without deleting it",
);
assert(
  WORK_COLUMNS.indexOf("unqualified") === WORK_COLUMNS.indexOf("lost") - 1,
  "unqualified sits immediately before lost",
);
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

const now = new Date(2026, 9, 28, 15, 0, 0);
const yesterday = boardCardCue({ column: "lead", openedAt: "2026-10-27", now });
assert(yesterday.label === "New · yesterday" && yesterday.tone === "fresh", "a lead from yesterday stays new");
assert(boardCardCue({ column: "lead", openedAt: "2026-10-26", now }).label === "New · 2d", "a two-day lead stays new");
assert(boardCardCue({ column: "lead", openedAt: "2026-10-22", now }).label === "On track · 6d", "a lead past a couple of days is on track");
assert(boardCardCue({ column: "lead", openedAt: "2026-10-01", now }).label === "Aging · 27d", "a lead past two weeks is aging");
assert(boardCardCue({ column: "lead", openedAt: "2026-09-04", now }).label === "Stale · 54d", "a lead past a month and a half is stale");
const viewed = boardCardCue({ column: "proposal_sent", openedAt: "2026-10-20", estimate: "viewed", now });
assert(
  viewed.label === "Viewed · follow up" && viewed.tone === "attention",
  "a viewed proposal asks for follow up",
);
assert(
  boardCardCue({ column: "supplementing", openedAt: "2026-10-21", now }).label === "Supplementing · 7d",
  "fresh supplementing names the stage",
);
assert(boardCardCue({ column: "in_progress", startedAt: "2026-10-20", now }).label === "On track · 8d", "fresh production stays on track");
assert(boardCardCue({ column: "in_progress", startedAt: "2026-10-11", now }).label === "Aging · 17d", "production past two weeks is aging");
assert(boardCardCue({ column: "complete", now }).label === "Done", "finished work is done");
assert(boardCardName("Shawn Gonzales", "Gonzales — 5400 Ragan Dr") === "Gonzales", "person cards use the last name");
assert(boardCardName("Northline Roofing LLC", "Northline — site") === "Northline Roofing LLC", "company names stay whole");
assert(boardCardName("", "Roof replacement — 1 Main") === "Roof replacement", "blank customer falls back to the title");
assert(
  boardCardAddress({ street: "5400 Ragan Dr", city: "The Colony", state: "TX" }) === "5400 Ragan Dr, The Colony",
  "address is street and city",
);
assert(isShelvedWorkColumn("lost"), "lost is closed");
assert(!isShelvedWorkColumn("complete"), "complete stays on the open board");

console.log("work-board card tests passed");
