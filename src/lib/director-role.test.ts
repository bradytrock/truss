import assert from "node:assert/strict";
import { canReviewCloseout, canSubmitProjectCloseout } from "./commission-closeout.ts";
import { canReviewJobCodes } from "./job-code.ts";
import { canSeeStaffCalendar } from "./calendar.ts";
import { isMessageCompanyAdmin } from "./message-threads.ts";
import { canViewTeamGoal, goalRoster } from "./sales-goal.ts";
import type { SeatRole, StaffMember } from "./types.ts";
import {
  accessScope,
  canDeleteJobs,
  canLeadCompany,
  canLoginAs,
  canManageAutomations,
  canManageSettings,
  canViewAccounting,
  canViewProjectFinancials,
  canViewReports,
  loginAsTargets,
  scopeDescription,
} from "./visibility.ts";

function member(role: SeatRole, patch: Partial<StaffMember> = {}): StaffMember {
  return {
    id: patch.id ?? role,
    name: patch.name ?? role,
    title: patch.title ?? role,
    role,
    teamId: patch.teamId ?? null,
    initials: "DR",
    email: `${role}@example.com`,
    phone: "",
    cardSlug: role,
    emailSignature: "",
    locked: patch.locked ?? false,
    restricted: patch.restricted ?? false,
    inviteExpiresAt: null,
    inviteToken: null,
    ...patch,
    role,
  };
}

const director = member("director", { id: "director", name: "Dana Director" });
const admin = member("company_admin", { id: "admin", name: "Avery Admin" });
const pm = member("project_manager", { id: "pm", name: "Pat Manager", teamId: "team-a" });
const accountant = member("accountant", { id: "books", name: "Casey Books" });

assert.equal(accessScope("director"), "company");
assert.equal(accessScope("director", true), "own");
assert.equal(canViewReports("director"), true);
assert.equal(canViewProjectFinancials("director"), true);
assert.equal(canViewAccounting("director"), false);
assert.equal(canViewAccounting("company_admin"), true);
assert.equal(canViewAccounting("accountant"), true);
assert.equal(canManageSettings("director", director), false);
assert.equal(canManageSettings("company_admin", admin), true);
assert.equal(canManageAutomations("director", director), true);
assert.equal(canLeadCompany("director", director), true);
assert.equal(canLeadCompany("director", { ...director, locked: true }), false);
assert.equal(canDeleteJobs(director), true);
assert.equal(canDeleteJobs(accountant), false);
assert.equal(canLoginAs(director), true);
assert.deepEqual(
  loginAsTargets(director, [director, admin, pm]).map((person) => person.id),
  ["admin", "pm"],
);
assert.equal(canReviewJobCodes("director"), true);
assert.equal(canReviewCloseout("director"), false);
assert.equal(canReviewCloseout("company_admin"), true);
assert.equal(
  canSubmitProjectCloseout({
    role: "director",
    title: "Director",
    viewerName: "Dana Director",
    viewerStaffId: "director",
    projectManager: "Pat Manager",
    ownerStaffId: "pm",
  }),
  true,
);
assert.equal(canViewTeamGoal("director"), true);
assert.deepEqual(
  goalRoster(director, [director, admin, pm, accountant]).map((person) => person.id).sort(),
  goalRoster(admin, [director, admin, pm, accountant]).map((person) => person.id).sort(),
);
assert.equal(
  canSeeStaffCalendar(director, pm, undefined, []),
  true,
);
assert.equal(
  isMessageCompanyAdmin({
    profileId: "p",
    staffId: "director",
    name: "Dana Director",
    role: "director",
    profileRole: "director",
    teamId: null,
  }),
  true,
);
assert.match(scopeDescription(director, director, false, []), /Accounting Suite/);
assert.doesNotMatch(scopeDescription(admin, admin, false, []), /Accounting Suite/);

console.log("director-role.test.ts ok");
