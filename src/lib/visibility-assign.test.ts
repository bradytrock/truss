import assert from "node:assert/strict";
import { companyLeadAssignees, assignableStaff } from "@/lib/visibility";
import type { SeatRole, StaffMember } from "@/lib/types";

function member(id: string, role: SeatRole, teamId: string | null, locked = false): StaffMember {
  return {
    id,
    name: id,
    title: role,
    role,
    teamId,
    initials: id.slice(0, 2).toUpperCase(),
    email: `${id}@example.com`,
    phone: "",
    cardSlug: id,
    emailSignature: "",
    locked,
    restricted: false,
    inviteExpiresAt: null,
    inviteToken: null,
  };
}

const viewer = member("pm", "project_manager", "team-a");
const staff = [
  viewer,
  member("estimator", "estimator", "team-b"),
  member("lead", "team_lead", "team-a"),
  member("admin", "company_admin", null),
  member("locked", "project_manager", "team-a", true),
];

const company = companyLeadAssignees(viewer, staff).map((person) => person.id);
assert.deepEqual(company, ["pm", "admin", "estimator", "lead"]);
assert.equal(company.includes("locked"), false);

const scoped = assignableStaff(viewer, staff).map((person) => person.id);
assert.deepEqual(scoped, ["pm"]);
