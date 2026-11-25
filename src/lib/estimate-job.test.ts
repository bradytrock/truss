import assert from "node:assert/strict";
import { claimEstimatesForJob, estimatesOnJob, jobForEstimate } from "./estimate-job.ts";

const hilltop = { id: "job-hilltop", opportunityId: "opp-hilltop", deletedAt: null };
const oakview = { id: "job-oakview", opportunityId: "opp-oakview", deletedAt: null };
const deleted = { id: "job-old", opportunityId: "opp-old", deletedAt: "2026-10-01T00:00:00.000Z" };

const unlinked = { id: "est-1123", jobId: null, opportunityId: "opp-hilltop" };
const linked = { id: "est-2000", jobId: "job-oakview", opportunityId: "opp-oakview" };
const other = { id: "est-9", jobId: "job-other", opportunityId: "opp-hilltop" };

assert.equal(jobForEstimate(unlinked, [hilltop, oakview])?.id, "job-hilltop");
assert.equal(jobForEstimate({ jobId: null, opportunityId: "missing" }, [hilltop]), undefined);
assert.equal(
  jobForEstimate(unlinked, [hilltop, { ...hilltop, id: "job-hilltop-2" }]),
  undefined,
);
assert.equal(jobForEstimate({ jobId: "job-old", opportunityId: "opp-old" }, [deleted])?.id, "job-old");

assert.deepEqual(
  estimatesOnJob(hilltop, [unlinked, linked, other]).map((estimate) => estimate.id),
  ["est-1123"],
);
assert.deepEqual(
  estimatesOnJob(oakview, [unlinked, linked]).map((estimate) => estimate.id),
  ["est-2000"],
);
assert.deepEqual(estimatesOnJob(deleted, [unlinked, { id: "est-old", jobId: null, opportunityId: "opp-old" }]), []);
assert.deepEqual(
  estimatesOnJob(deleted, [{ id: "est-kept", jobId: "job-old", opportunityId: "opp-old" }]).map(
    (estimate) => estimate.id,
  ),
  ["est-kept"],
);

const claimed = claimEstimatesForJob([unlinked, linked], hilltop);
assert.equal(claimed[0]?.jobId, "job-hilltop");
assert.equal(claimed[1]?.jobId, "job-oakview");
const unchanged = [linked];
assert.equal(claimEstimatesForJob(unchanged, hilltop), unchanged);
assert.equal(claimEstimatesForJob(unchanged, { id: "job-x", opportunityId: null }), unchanged);

console.log("estimate-job.test.ts ok");
