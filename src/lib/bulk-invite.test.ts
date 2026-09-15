import assert from "node:assert/strict";
import { parseBulkInviteRows, type BulkInviteDraft } from "./bulk-invite.ts";

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

console.log("bulk-invite.test.ts ok");
