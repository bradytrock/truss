import assert from "node:assert/strict";
import {
  addTeamMembership,
  attachTeamMemberships,
  memberTeamIds,
  membersOnTeam,
  primaryTeamId,
  sharesAnyTeam,
  staffTeamNames,
  staffWithTeams,
  teamsLedAfterMembershipChange,
} from "./teams.ts";
import type { StaffMember, Team } from "./types.ts";

function seat(teamId: string | null, teamIds?: string[]): StaffMember {
  return {
    id: teamId ?? "none",
    name: "Alex",
    title: "PM",
    role: "project_manager",
    teamId,
    teamIds,
    initials: "AL",
    email: "",
    phone: "",
    cardSlug: "alex",
    emailSignature: "",
    locked: false,
    restricted: false,
    inviteExpiresAt: null,
    inviteToken: null,
  };
}

assert.deepEqual(memberTeamIds(seat("field")), ["field"]);
assert.deepEqual(memberTeamIds(seat(null)), []);
assert.deepEqual(memberTeamIds(seat("field", ["office", "field"])), ["field", "office"]);
assert.deepEqual(memberTeamIds(seat("field", [])), []);

assert.equal(primaryTeamId(["office", "field"], "field"), "field");
assert.equal(primaryTeamId(["office"], "field"), "office");
assert.equal(primaryTeamId([], "field"), "");

const kept = staffWithTeams(seat("field", ["field", "office"]), ["office", "sales"], "field");
assert.equal(kept.teamId, "office");
assert.deepEqual(kept.teamIds, ["office", "sales"]);

const added = addTeamMembership(seat("field"), "office");
assert.equal(added.teamId, "field");
assert.deepEqual(added.teamIds, ["field", "office"]);

assert.equal(sharesAnyTeam(seat("field", ["field", "office"]), seat("sales", ["sales", "office"])), true);
assert.equal(sharesAnyTeam(seat("field"), seat("office")), false);

const roster = [
  seat("field"),
  { ...seat("office", ["office", "field"]), id: "both", locked: false },
  { ...seat("sales"), id: "sales", locked: true },
];
assert.deepEqual(
  membersOnTeam(roster, "field").map((member) => member.id),
  ["field", "both"],
);

const teams: Team[] = [
  { id: "field", name: "Field", leadStaffId: "both" },
  { id: "office", name: "Office", leadStaffId: "" },
  { id: "sales", name: "Sales", leadStaffId: "both" },
];
assert.deepEqual(staffTeamNames(teams, seat("field", ["field", "sales", "office"])), ["Field", "Office", "Sales"]);

const cleared = teamsLedAfterMembershipChange(teams, "both", ["field"]);
assert.equal(cleared.find((team) => team.id === "sales")?.leadStaffId, "");
assert.equal(cleared.find((team) => team.id === "field")?.leadStaffId, "both");

const attached = attachTeamMemberships(
  [seat("field", ["field"]), { ...seat("office"), id: "pat" }],
  [
    { staff_id: "field", team_id: "office" },
    { staff_id: "field", team_id: "field" },
  ],
);
assert.deepEqual(attached[0]?.teamIds, ["field", "office"]);
assert.deepEqual(attached[1]?.teamIds, ["office"]);

console.log("teams.test.ts ok");
