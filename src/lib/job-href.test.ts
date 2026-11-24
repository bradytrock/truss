import assert from "node:assert/strict";
import { jobForLead, jobPaperHref, jobRecordHref, uniqueIds, uniqueNames } from "./job-record.ts";
import type { Job } from "./types.ts";

function leadJob(partial: Pick<Job, "id" | "opportunityId"> & Partial<Job>): Job {
  return { deletedAt: null, contractValue: 0, ...partial } as Job;
}

assert.equal(jobRecordHref("job_1"), "/jobs?job=job_1");
assert.equal(jobRecordHref("job_1", { tab: "financials" }), "/jobs?job=job_1&tab=financials");
assert.equal(jobPaperHref("job_1"), "/jobs?job=job_1&tab=paper");

assert.deepEqual(uniqueNames(["Ava", null, " ava ", undefined, "Ben"]), ["Ava", "Ben"]);
assert.deepEqual(uniqueIds(["a", "", null, "a", "b"]), ["a", "b"]);

const live = leadJob({ id: "real", opportunityId: "opp" });
const trashed = leadJob({ id: "gone", opportunityId: "opp", deletedAt: "2026-01-01" });
const synthetic = leadJob({ id: "job_lead_opp", opportunityId: "opp", contractValue: 9 });
assert.equal(jobForLead([trashed], "opp"), undefined);
assert.equal(jobForLead([synthetic, live], "opp")?.id, "real");
assert.equal(jobForLead([live], "  opp  ")?.id, "real");
assert.equal(jobForLead([live], "other"), undefined);

console.log("job-href.test.ts ok");
