import assert from "node:assert/strict";
import {
  isReturningClientTask,
  returningClientTaskAssignees,
} from "./returning-client.ts";
import type { StaffMember } from "./types.ts";

function member(partial: Partial<StaffMember> & Pick<StaffMember, "id" | "name" | "role">): StaffMember {
  return {
    title: "",
    teamId: null,
    initials: "XX",
    email: "",
    phone: "",
    emailSignature: "",
    cardSlug: "",
    locked: false,
    restricted: false,
    manageAutomations: false,
    inviteExpiresAt: null,
    inviteToken: null,
    ...partial,
  };
}

const staff = [
  member({ id: "pm", name: "Brady Jones", role: "company_admin" }),
  member({ id: "aaron", name: "Aaron Sadler", role: "company_admin" }),
  member({ id: "jenn", name: "Jenn Whitby", role: "company_admin" }),
  member({ id: "josh", name: "Josh Gamlen", role: "company_admin" }),
  member({ id: "sam", name: "Sam Rogers", role: "project_manager" }),
];

assert.deepEqual(
  returningClientTaskAssignees("offered", staff, "pm").map((item) => item.name),
  ["Brady Jones"],
);
assert.deepEqual(
  returningClientTaskAssignees("assigned", staff, "pm").map((item) => item.name),
  ["Brady Jones"],
);
assert.deepEqual(returningClientTaskAssignees("pending", staff, "pm"), []);
assert.deepEqual(returningClientTaskAssignees("offered", staff, "missing"), []);

assert.equal(isReturningClientTask({ title: "Take or decline returning-client lead: Jenn Whitby" }), true);
assert.equal(isReturningClientTask({ title: "Decide returning-client lead: Jenn Whitby" }), true);
assert.equal(isReturningClientTask({ title: "Call Jenn Whitby back" }), false);

console.log("returning-client.test.ts ok");
