import assert from "node:assert/strict";
import { groupLoginAsTargets, recentLoginAsTargets } from "./login-as.ts";
import type { StaffMember, Team } from "./types.ts";

function seat(id: string, name: string, teamId: string | null): StaffMember {
  return {
    id,
    name,
    title: "PM",
    role: "project_manager",
    teamId,
    initials: name.slice(0, 2).toUpperCase(),
    email: "",
    phone: "",
    cardSlug: id,
    emailSignature: "",
    locked: false,
    restricted: false,
    inviteExpiresAt: null,
    inviteToken: null,
  };
}

const teams: Team[] = [
  { id: "t-denver", name: "Denver", leadStaffId: "a" },
  { id: "t-austin", name: "Austin", leadStaffId: "b" },
];

const staff = [
  seat("c", "Chris", "t-denver"),
  seat("a", "Ava", "t-austin"),
  seat("b", "Ben", null),
  seat("d", "Drew", "t-denver"),
];

const groups = groupLoginAsTargets(staff, teams);
assert.deepEqual(
  groups.map(([heading, members]) => [heading, members.map((member) => member.name)]),
  [
    ["Austin", ["Ava"]],
    ["Denver", ["Chris", "Drew"]],
    ["No team", ["Ben"]],
  ],
);

const recent = recentLoginAsTargets(staff, ["d", "missing", "a", "d"]);
assert.deepEqual(
  recent.map((member) => member.id),
  ["d", "a"],
);

console.log("login-as.test.ts ok");
