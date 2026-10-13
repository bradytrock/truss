import assert from "node:assert/strict";
import { primaryHomeownerPatch, removeContactFromJob } from "./job-record.ts";

const job = {
  primaryContactId: "homeowner",
  relatedContactIds: ["co-owner", "adjuster"],
  subcontractorIds: ["roofer"],
};

const cleared = removeContactFromJob(job, "homeowner");
assert.deepEqual(cleared, { primaryContactId: null });

const coOwner = removeContactFromJob(job, "co-owner");
assert.deepEqual(coOwner, { relatedContactIds: ["adjuster"] });

const trade = removeContactFromJob(job, "roofer");
assert.deepEqual(trade, { subcontractorIds: [] });

assert.equal(removeContactFromJob(job, "missing"), null);
assert.equal(removeContactFromJob(job, "  "), null);

const tangled = removeContactFromJob(
  {
    primaryContactId: " homeowner ",
    relatedContactIds: ["homeowner", "co-owner", "homeowner"],
    subcontractorIds: ["homeowner", "roofer"],
  },
  "homeowner",
);
assert.deepEqual(tangled, {
  primaryContactId: null,
  relatedContactIds: ["co-owner"],
  subcontractorIds: ["roofer"],
});

const promoted = primaryHomeownerPatch(
  { primaryContactId: null, relatedContactIds: ["co-owner"], subcontractorIds: [] },
  "co-owner",
);
assert.deepEqual(promoted, {
  primaryContactId: "co-owner",
  relatedContactIds: [],
  subcontractorIds: [],
});

console.log("job-record.test.ts ok");
