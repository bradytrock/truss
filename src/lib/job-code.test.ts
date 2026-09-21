import assert from "node:assert/strict";
import {
  actionableJobCodeReviews,
  canReviewJobCodes,
  codeReviewAudience,
  creatorInitials,
  isJobCodeReviewTask,
  isJobReassigned,
  jobCodeOwnerName,
  jobCodeReviewNotes,
  jobCodeReviewTitle,
  nextJobCode,
  openJobCodeReviews,
  parseJobCodeDate,
  parseJobCodeReviewNotes,
  suggestedJobCode,
} from "./job-code.ts";

assert.equal(creatorInitials("Blake Jones"), "BJ");
assert.equal(creatorInitials("Marty"), "MA");

const day = new Date(2026, 8, 21, 12, 0, 0);
assert.equal(nextJobCode("Blake Jones", day, []), "BJ092126-A");
assert.equal(nextJobCode("Marty Torres", day, ["BJ092126-A"]), "MT092126-A");

assert.equal(jobCodeOwnerName({ projectManager: "Blake Jones", fallback: "Admin" }), "Blake Jones");
assert.equal(
  jobCodeOwnerName({
    estimator: "Priya Shah",
    ownerStaffId: "st_1",
    staff: [{ id: "st_1", name: "Admin" }],
    fallback: "Fallback",
  }),
  "Priya Shah",
);
assert.equal(
  jobCodeOwnerName({
    ownerStaffId: "st_1",
    staff: [{ id: "st_1", name: "Elena Voss" }],
    fallback: "Fallback",
  }),
  "Elena Voss",
);

assert.equal(isJobReassigned("Marty Torres", "Blake Jones"), true);
assert.equal(isJobReassigned("Blake Jones", "blake jones"), false);
assert.equal(isJobReassigned("", "Blake Jones"), false);

assert.equal(canReviewJobCodes("company_admin"), true);
assert.equal(canReviewJobCodes("accountant"), true);
assert.equal(canReviewJobCodes("project_manager"), false);
assert.deepEqual(
  codeReviewAudience([
    { role: "company_admin", locked: false, name: "Ada" },
    { role: "accountant", locked: false, name: "Cal" },
    { role: "accountant", locked: true, name: "Old" },
    { role: "project_manager", locked: false, name: "Pat" },
  ]).map((member) => member.name),
  ["Ada", "Cal"],
);

const stamped = parseJobCodeDate("MT092126-A");
assert.ok(stamped);
assert.equal(stamped.getMonth(), 8);
assert.equal(stamped.getDate(), 21);
assert.equal(stamped.getFullYear(), 2026);
assert.equal(parseJobCodeDate("nope"), null);

assert.equal(suggestedJobCode("Blake Jones", "MT092126-A", ["MT092126-A"]), "BJ092126-A");
assert.equal(jobCodeReviewTitle("MT092126-A"), "Review job code MT092126-A");
assert.equal(isJobCodeReviewTask({ title: "Review job code MT092126-A", relatedType: "job" }), true);
assert.equal(isJobCodeReviewTask({ title: "Call the homeowner", relatedType: "job" }), false);

const notes = jobCodeReviewNotes({
  fromName: "Marty Torres",
  toName: "Blake Jones",
  fromCode: "MT092126-A",
  suggestedCode: "BJ092126-A",
});
assert.deepEqual(parseJobCodeReviewNotes(notes), {
  fromName: "Marty Torres",
  toName: "Blake Jones",
  fromCode: "MT092126-A",
  suggestedCode: "BJ092126-A",
});

const reviewTasks = [
  {
    title: "Review job code MT092126-A",
    relatedType: "job",
    relatedId: "job_1",
    completed: false,
    notes,
  },
  {
    title: "Review job code MT092126-A",
    relatedType: "job",
    relatedId: "job_1",
    completed: false,
    notes,
  },
];
const reviewJobs = [{ id: "job_1", code: "MT092126-A", name: "Azure Lane", projectManager: "Blake Jones" }];
assert.equal(openJobCodeReviews(reviewTasks, reviewJobs).length, 1);
assert.equal(actionableJobCodeReviews(reviewTasks, reviewJobs, { role: "company_admin" }).length, 1);
assert.equal(actionableJobCodeReviews(reviewTasks, reviewJobs, { role: "project_manager" }).length, 0);

console.log("job-code.test.ts ok");
