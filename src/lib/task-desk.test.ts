import assert from "node:assert/strict";
import {
  collapseSharedReviewTasks,
  filterTasks,
  formatTaskAssignees,
  parseDueTaskReminder,
  searchTasks,
  sortTasks,
  taskAssignedTo,
  taskIsOverdue,
  taskRelatedHref,
  taskReminderSubject,
  taskReminderText,
} from "./task-desk.ts";
import type { Task } from "./types.ts";

function task(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    dueAt: "2026-09-20",
    completed: false,
    relatedType: null,
    relatedId: null,
    assignee: "Brady Jones",
    ...partial,
  };
}

const openMine = task({ id: "a", title: "Call back", dueAt: "2099-01-15" });
const overdue = task({ id: "b", title: "Photos", dueAt: "2020-01-15", assignee: "Maya Chen" });
const done = task({ id: "c", title: "Done", completed: true, dueAt: "2020-01-10" });
const all = [done, overdue, openMine];

assert.equal(taskIsOverdue(overdue), true);
assert.equal(taskIsOverdue(openMine), false);
assert.equal(taskIsOverdue(done), false);

assert.deepEqual(
  filterTasks(all, "mine", "Brady Jones").map((item) => item.id),
  ["a"],
);
assert.deepEqual(
  filterTasks(all, "overdue", "Brady Jones").map((item) => item.id),
  ["b"],
);
assert.deepEqual(
  filterTasks(all, "done", "Brady Jones").map((item) => item.id),
  ["c"],
);
assert.equal(filterTasks(all, "open", "Brady Jones").length, 2);

const shared = task({
  id: "shared",
  title: "Review job code MJ111026-A",
  dueAt: "2099-01-15",
  relatedType: "job",
  relatedId: "job-1",
  assignee: "Alan Gull",
  assignees: ["Alan Gull", "Tami Vaughn", "Josh Gamlen"],
});
assert.equal(taskAssignedTo(shared, "Tami Vaughn"), true);
assert.equal(taskAssignedTo(shared, "Brady Jones"), false);
assert.equal(
  formatTaskAssignees(shared),
  "Alan Gull, Tami Vaughn, and Josh Gamlen",
);
assert.deepEqual(
  filterTasks([shared, openMine], "mine", "Josh Gamlen").map((item) => item.id),
  ["shared"],
);
assert.deepEqual(searchTasks([shared], "tami").map((item) => item.id), ["shared"]);

const copies = collapseSharedReviewTasks([
  task({
    id: "copy-a",
    title: "Review job code MJ111026-A",
    relatedType: "job",
    relatedId: "job-1",
    assignee: "Alan Gull",
    notes: "Reassigned from Martin Johnson to Brandon Overby.",
  }),
  task({
    id: "copy-b",
    title: "Review job code MJ111026-A",
    relatedType: "job",
    relatedId: "job-1",
    assignee: "Tami Vaughn",
    notes: "Reassigned from Martin Johnson to Brandon Overby.",
  }),
  task({ id: "other", title: "Call back", assignee: "Brady Jones" }),
]);
assert.deepEqual(
  copies.tasks.map((item) => item.id),
  ["copy-a", "other"],
);
assert.deepEqual(copies.tasks[0]?.assignees, ["Alan Gull", "Tami Vaughn"]);
assert.equal(collapseSharedReviewTasks(copies.tasks).changed, false);

assert.deepEqual(
  sortTasks(all).map((item) => item.id),
  ["b", "a", "c"],
);

assert.equal(taskRelatedHref({ relatedType: "job", relatedId: "job-1" }), "/jobs/job-1");
assert.equal(taskRelatedHref({ relatedType: null, relatedId: null }), null);
assert.equal(taskReminderSubject("Call Dana", false), "Due today: Call Dana");
assert.equal(taskReminderSubject("Call Dana", true), "Overdue: Call Dana");
assert.deepEqual(searchTasks(all, "photos").map((item) => item.id), ["b"]);
assert.equal(
  taskReminderText({
    title: "Call Dana",
    dueLabel: "Jan 15, 2099",
    notes: "After 3",
    assigneeName: "Brady Jones",
    companyName: "Truss",
    overdue: false,
  }).includes("Call Dana is due today."),
  true,
);
assert.equal(
  parseDueTaskReminder({
    task_id: "t1",
    assignee_email: "brady@example.com",
    title: "Call Dana",
    company_name: "Truss",
  })?.assigneeEmail,
  "brady@example.com",
);
assert.equal(parseDueTaskReminder({ title: "No email" }), null);

console.log("task-desk.test.ts ok");
