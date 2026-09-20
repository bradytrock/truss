import assert from "node:assert/strict";
import { jobPaperHref, jobRecordHref, uniqueIds, uniqueNames } from "./job-record.ts";

assert.equal(jobRecordHref("job_1"), "/jobs?job=job_1");
assert.equal(jobRecordHref("job_1", { tab: "financials" }), "/jobs?job=job_1&tab=financials");
assert.equal(jobPaperHref("job_1"), "/jobs?job=job_1&tab=paper");

assert.deepEqual(uniqueNames(["Ava", null, " ava ", undefined, "Ben"]), ["Ava", "Ben"]);
assert.deepEqual(uniqueIds(["a", "", null, "a", "b"]), ["a", "b"]);

console.log("job-href.test.ts ok");
