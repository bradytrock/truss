import assert from "node:assert/strict";
import {
  avatarTone,
  buildHomeBrief,
  buildHomeFocus,
  jobsMissingContract,
  openCallbacks,
  overdueDays,
  sourceShares,
  sparklinePath,
  unsignedProposals,
} from "./home-today.ts";
import type { Estimate, Job, Task } from "./types.ts";

assert.ok(overdueDays("2000-01-01") > 0);
assert.equal(overdueDays("2099-12-31"), 0);

assert.deepEqual(
  openCallbacks([
    { id: "b", title: "B", dueAt: "2026-09-10", completed: false, relatedType: null, relatedId: null, assignee: "" },
    { id: "a", title: "A", dueAt: "2026-09-01", completed: false, relatedType: null, relatedId: null, assignee: "" },
    { id: "c", title: "C", dueAt: "2026-09-01", completed: true, relatedType: null, relatedId: null, assignee: "" },
  ] as Task[]).map((task) => task.id),
  ["a", "b"],
);

assert.equal(
  unsignedProposals([
    { status: "sent" },
    { status: "viewed" },
    { status: "accepted" },
    { status: "draft" },
  ] as Estimate[]).length,
  2,
);

assert.equal(
  jobsMissingContract([
    { contractValue: 0 },
    { contractValue: 1200 },
  ] as Job[]).length,
  1,
);

const brief = buildHomeBrief({
  firstName: "Brady",
  callbackCount: 6,
  oldestCallback: { name: "Chris Jones", dueAt: "2026-09-04" },
  proposalCount: 2,
  preconWithoutStart: 4,
  jobsWithoutContract: 5,
  now: new Date("2026-09-15T10:00:00"),
});
assert.match(brief.greet, /Brady/);
assert.match(brief.text, /6 callbacks/);
assert.match(brief.text, /Chris Jones/);
assert.match(brief.text, /still unsigned/);
assert.equal(brief.actions[0]?.primary, true);

const clear = buildHomeBrief({
  firstName: "Brady",
  callbackCount: 0,
  proposalCount: 0,
  preconWithoutStart: 0,
  jobsWithoutContract: 0,
  now: new Date("2026-09-15T10:00:00"),
});
assert.match(clear.text, /Nothing is blocking/);

const focus = buildHomeFocus({
  callbackCount: 6,
  oldestDays: 11,
  proposalCount: 2,
  jobsWithoutContract: 5,
  names: ["Chris Jones"],
});
assert.equal(focus.action, "Start calling");
assert.match(focus.detail, /11/);

assert.ok(sparklinePath([0, 4, 2]).startsWith("M"));
assert.deepEqual(sourceShares([{ label: "Website", value: 84 }, { label: "Past client", value: 16 }])[0]?.pct, 84);
assert.ok(avatarTone("Brady Jones").bg);

console.log("home-today tests passed");
