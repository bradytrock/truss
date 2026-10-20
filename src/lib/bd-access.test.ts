import assert from "node:assert/strict";
import { canSubmitProjectCloseout } from "./commission-closeout.ts";
import type { SeatRole } from "./types.ts";
import {
  canCreateEstimates,
  canCreateInvoices,
  canCreatePages,
  canEditPages,
  canManageCompanyCamMapping,
  canViewInsurance,
  canViewJobPaper,
  canViewProjectFinancials,
  canViewTraining,
} from "./visibility.ts";

const roles: SeatRole[] = [
  "company_admin",
  "director",
  "business_development",
  "team_lead",
  "team_admin",
  "project_manager",
  "estimator",
  "superintendent",
  "accountant",
];

for (const role of roles) {
  const bd = role === "business_development";
  assert.equal(canCreateEstimates(role), !bd, `create estimates · ${role}`);
  assert.equal(canCreateInvoices(role), !bd, `create invoices · ${role}`);
  assert.equal(canCreatePages(role), !bd, `create pages · ${role}`);
  assert.equal(canEditPages(role), !bd, `edit pages · ${role}`);
  assert.equal(canManageCompanyCamMapping(role), !bd, `companycam · ${role}`);
  assert.equal(canViewJobPaper(role), !bd, `paper · ${role}`);
  assert.equal(canViewInsurance(role), !bd, `insurance · ${role}`);
  assert.equal(canViewTraining(role), !bd, `training · ${role}`);
  assert.equal(canViewProjectFinancials(role), !bd, `financials · ${role}`);
}

assert.equal(canCreateEstimates(undefined), false);
assert.equal(canCreateInvoices(undefined), false);
assert.equal(canCreatePages(undefined), false);
assert.equal(canManageCompanyCamMapping(undefined), false);
assert.equal(canViewJobPaper(undefined), false);
assert.equal(canViewInsurance(undefined), false);
assert.equal(canViewTraining(undefined), false);

assert.equal(
  canSubmitProjectCloseout({
    role: "business_development",
    title: "Business development",
    viewerName: "Sam Lead",
    viewerStaffId: "staff_sam",
    projectManager: "Sam Lead",
    ownerStaffId: "staff_sam",
  }),
  false,
);
assert.equal(
  canSubmitProjectCloseout({
    role: "project_manager",
    title: "Project manager",
    viewerName: "Ada Lopez",
    viewerStaffId: "staff_ada",
    projectManager: "Ada Lopez",
    ownerStaffId: "staff_ada",
  }),
  true,
);
