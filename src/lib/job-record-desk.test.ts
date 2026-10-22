import assert from "node:assert/strict";
import { prepareDeskJobs } from "./job-record.ts";
import type { Job } from "./types.ts";

function job(partial: Partial<Job> & Pick<Job, "id">): Job {
  return {
    name: "Roof",
    code: "",
    opportunityId: null,
    contractValue: 0,
    assigned: [],
    superintendent: "",
    projectManager: "",
    salesRep: "",
    ...partial,
  } as Job;
}

const duplicates = prepareDeskJobs(
  [
    job({ id: "a", opportunityId: "lead", contractValue: 100 }),
    job({ id: "b", opportunityId: "lead", contractValue: 500 }),
  ],
  [],
  "Alex",
);
assert.deepEqual(
  duplicates.jobs.map((item) => item.id),
  ["b"],
);
assert.equal(duplicates.dropped.get("a"), "b");
assert.equal(duplicates.dirty, true);

const clean = prepareDeskJobs([job({ id: "only" })], [], "Alex");
assert.equal(clean.dirty, false);
assert.equal(clean.jobs[0], clean.persistFrom[0]);

const scrubbed = prepareDeskJobs(
  [job({ id: "c", assigned: ["Jordan Hale", "Alex"], projectManager: "Jordan Hale" })],
  [],
  "Alex",
);
assert.equal(scrubbed.dirty, true);
assert.deepEqual(scrubbed.jobs[0]?.assigned, ["Alex"]);
assert.equal(scrubbed.jobs[0]?.projectManager, "Alex");
assert.equal(scrubbed.persistFrom[0]?.projectManager, "Alex");

console.log("job-record-desk.test.ts ok");
