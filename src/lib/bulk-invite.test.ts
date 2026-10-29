import assert from "node:assert/strict";
import {
  BULK_INVITE_CSV_TEMPLATE,
  BULK_INVITE_MAX_ROWS,
  mergeBulkInviteRows,
  parseBulkInviteCsv,
  parseBulkInviteRole,
  parseBulkInviteRows,
  type BulkInviteDraft,
} from "./bulk-invite.ts";
import type { Team } from "./types.ts";

function row(partial: Partial<BulkInviteDraft> & Pick<BulkInviteDraft, "key">): BulkInviteDraft {
  return {
    name: "",
    email: "",
    role: "superintendent",
    title: "Superintendent",
    teamId: "",
    ...partial,
  };
}

const blank = parseBulkInviteRows(
  [row({ key: "1" }), row({ key: "2", name: "  ", email: "  " })],
  [],
);
assert.deepEqual(blank.ready, []);
assert.deepEqual(blank.issues, []);

const missingEmail = parseBulkInviteRows([row({ key: "1", name: "Alex Rivera" })], []);
assert.equal(missingEmail.ready.length, 0);
assert.equal(missingEmail.issues[0]?.message, "Add the email this invite will go to.");

const badEmail = parseBulkInviteRows(
  [row({ key: "1", name: "Alex Rivera", email: "alex" })],
  [],
);
assert.equal(badEmail.issues[0]?.message, "That email does not look right.");

const duplicateCompany = parseBulkInviteRows(
  [row({ key: "1", name: "Alex Rivera", email: "Alex@Company.com" })],
  ["alex@company.com"],
);
assert.equal(duplicateCompany.issues[0]?.message, "That email is already on this list or this company.");

const duplicateGrid = parseBulkInviteRows(
  [
    row({ key: "1", name: "Alex Rivera", email: "alex@company.com" }),
    row({ key: "2", name: "Alex Two", email: "alex@company.com" }),
  ],
  [],
);
assert.equal(duplicateGrid.ready.length, 1);
assert.equal(duplicateGrid.issues[0]?.key, "2");

const ready = parseBulkInviteRows(
  [
    row({ key: "1", name: "Alex Rivera", email: "alex@company.com", teamId: "team_field" }),
    row({ key: "2" }),
    row({
      key: "3",
      name: "Jordan Lee",
      email: "jordan@company.com",
      role: "estimator",
      title: "",
    }),
  ],
  [],
);
assert.equal(ready.issues.length, 0);
assert.equal(ready.ready.length, 2);
assert.equal(ready.ready[0]?.email, "alex@company.com");
assert.equal(ready.ready[0]?.teamId, "team_field");
assert.equal(ready.ready[1]?.title, "Estimator");

// CSV import

const teams: Team[] = [
  { id: "team_field", name: "Field", leadStaffId: "" },
  { id: "team_office", name: "Front Office", leadStaffId: "" },
];

assert.equal(parseBulkInviteRole(""), "project_manager");
assert.equal(parseBulkInviteRole("Project manager"), "project_manager");
assert.equal(parseBulkInviteRole("project_manager"), "project_manager");
assert.equal(parseBulkInviteRole("PM"), "project_manager");
assert.equal(parseBulkInviteRole("Company Admin"), "company_admin");
assert.equal(parseBulkInviteRole("Accounting"), "accountant");
assert.equal(parseBulkInviteRole("Super"), "superintendent");
assert.equal(parseBulkInviteRole("wizard"), null);

const template = parseBulkInviteCsv(BULK_INVITE_CSV_TEMPLATE, teams);
assert.equal(template.issues.length, 0);
assert.equal(template.skipped, 0);
assert.equal(template.rows.length, 3);
assert.equal(template.rows[0]?.name, "Alex Rivera");
assert.equal(template.rows[0]?.email, "alex@company.com");
assert.equal(template.rows[0]?.role, "project_manager");
assert.equal(template.rows[1]?.role, "estimator");
assert.equal(template.rows[1]?.teamId, "team_field");
assert.equal(template.rows[1]?.title, "Estimator");
assert.equal(template.rows[2]?.role, "company_admin");
assert.equal(template.rows[2]?.title, "Operations");
const templateReady = parseBulkInviteRows(template.rows, []);
assert.equal(templateReady.issues.length, 0);
assert.equal(templateReady.ready.length, 3);

const headerless = parseBulkInviteCsv("Jordan Lee,jordan@company.com\n", teams);
assert.equal(headerless.rows.length, 1);
assert.equal(headerless.rows[0]?.name, "Jordan Lee");
assert.equal(headerless.rows[0]?.role, "project_manager");

const reordered = parseBulkInviteCsv(
  [
    "Email Address,Last Name,First Name,Seat,Crew",
    "sam@company.com,Patel,Sam,Estimator,front office",
    "casey@company.com,Kim,Casey,wizard,Night Shift",
    "  ,  ,  ,  ,  ",
  ].join("\r\n"),
  teams,
);
assert.equal(reordered.rows.length, 2);
assert.equal(reordered.rows[0]?.name, "Sam Patel");
assert.equal(reordered.rows[0]?.teamId, "team_office");
assert.equal(reordered.rows[0]?.role, "estimator");
assert.equal(reordered.rows[1]?.role, "project_manager");
assert.equal(reordered.rows[1]?.teamId, "");
assert.deepEqual(
  reordered.issues.map((issue) => issue.line),
  [3, 3],
);
assert.match(reordered.issues[0]?.message ?? "", /Role “wizard”/);
assert.match(reordered.issues[1]?.message ?? "", /No team named “Night Shift”/);

const quoted = parseBulkInviteCsv('name,email,title\n"Rivera, Alex",alex@company.com,"Lead, Roofing"\n', teams);
assert.equal(quoted.rows[0]?.name, "Rivera, Alex");
assert.equal(quoted.rows[0]?.title, "Lead, Roofing");

const big = parseBulkInviteCsv(
  ["name,email", ...Array.from({ length: 60 }, (_, i) => `Person ${i},p${i}@company.com`)].join("\n"),
  teams,
);
assert.equal(big.rows.length, BULK_INVITE_MAX_ROWS);
assert.equal(big.skipped, 10);

assert.throws(() => parseBulkInviteCsv("", teams), /empty/);
assert.throws(() => parseBulkInviteCsv("PK\u0003\u0004\u0000", teams), /Excel/);

const merged = mergeBulkInviteRows(
  [row({ key: "typed", name: "Typed Person", email: "typed@company.com" }), row({ key: "blank" })],
  template.rows,
);
assert.equal(merged.skipped, 0);
assert.deepEqual(
  merged.rows.map((item) => item.name),
  ["Typed Person", "Alex Rivera", "Jordan Lee", "Sam Patel"],
);

const full = mergeBulkInviteRows(
  Array.from({ length: BULK_INVITE_MAX_ROWS - 1 }, (_, i) =>
    row({ key: `k${i}`, name: `P ${i}`, email: `p${i}@company.com` }),
  ),
  template.rows,
);
assert.equal(full.rows.length, BULK_INVITE_MAX_ROWS);
assert.equal(full.skipped, 2);

console.log("bulk-invite.test.ts ok");
