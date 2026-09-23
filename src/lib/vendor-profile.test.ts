import assert from "node:assert/strict";
import {
  collectVendorNames,
  fillVendorProfile,
  findVendorProfile,
  planVendorDirectory,
  vendorFeedbackFor,
  vendorNameKey,
  vendorPricesFor,
  vendorProfileName,
} from "./vendor-profile.ts";

assert.equal(vendorNameKey("  ABC   Supply "), "abc supply");
assert.equal(vendorProfileName("  ABC   Supply "), "ABC Supply");

const profile = fillVendorProfile({ id: "p1", name: "Joe's Gutters" });
assert.equal(profile.nameKey, "joe's gutters");
assert.equal(profile.notes, "");

const profiles = [
  fillVendorProfile({ id: "p1", name: "ABC Supply" }),
  fillVendorProfile({ id: "p2", name: "Joe's Gutters" }),
];
assert.equal(findVendorProfile(profiles, { name: "abc  supply" })?.id, "p1");
assert.equal(findVendorProfile(profiles, { id: "p2" })?.name, "Joe's Gutters");

const feedback = vendorFeedbackFor("p1", [
  { id: "f1", profileId: "p1", body: "old", createdBy: "A", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "f2", profileId: "p1", body: "new", createdBy: "B", createdAt: "2026-02-01T00:00:00.000Z" },
  { id: "f3", profileId: "p2", body: "other", createdBy: "C", createdAt: "2026-03-01T00:00:00.000Z" },
]);
assert.deepEqual(
  feedback.map((item) => item.id),
  ["f2", "f1"],
);

const prices = vendorPricesFor("p1", [
  { id: "r2", profileId: "p1", name: "Tear-off", unit: "SQ", unitCost: 45, notes: "", sortOrder: 2 },
  { id: "r1", profileId: "p1", name: "Dumpster", unit: "EA", unitCost: 425, notes: "", sortOrder: 1 },
]);
assert.deepEqual(
  prices.map((item) => item.name),
  ["Dumpster", "Tear-off"],
);

assert.deepEqual(
  collectVendorNames({
    qbNames: ["ABC Supply"],
    expenseNames: ["abc supply", "SRS"],
    tradeNames: ["Joe's Gutters", ""],
  }),
  ["ABC Supply", "Joe's Gutters", "SRS"],
);

const planned = planVendorDirectory({
  qbVendors: [{ id: "v1", name: "ABC Supply" }],
  profiles: [
    fillVendorProfile({ id: "p1", name: "ABC Supply", notes: "Ask for Maria" }),
    fillVendorProfile({ id: "p2", name: "Joe's Gutters" }),
  ],
  feedback: [{ id: "f1", profileId: "p1", body: "On time", createdBy: "Sam", createdAt: "2026-09-02T00:00:00.000Z" }],
  prices: [{ id: "r1", profileId: "p2", name: "6 inch", unit: "LF", unitCost: 8, notes: "", sortOrder: 1 }],
  extraNames: [
    { name: "Joe's Gutters", kind: "trade" },
    { name: "SRS", kind: "payee" },
  ],
});
assert.equal(planned.find((row) => row.name === "ABC Supply")?.internalNotes, "Ask for Maria");
assert.equal(planned.find((row) => row.name === "ABC Supply")?.feedbackCount, 1);
assert.equal(planned.find((row) => row.name === "Joe's Gutters")?.kind, "trade");
assert.equal(planned.find((row) => row.name === "Joe's Gutters")?.priceCount, 1);
assert.equal(planned.find((row) => row.name === "SRS")?.kind, "payee");

console.log("vendor-profile.test.ts ok");
