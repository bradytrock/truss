import assert from "node:assert/strict";
import { nameFromEmail, parseListPaste } from "./lists";
import { resolveListAudience } from "./email-campaigns";
import type { Contact } from "../types";

const sheet = parseListPaste(`
sarah@kw.com
Sarah Chen, sarah@kw.com, 214-555-0142
Jamie Cole <jamie@example.com>
not an email
`);

assert.equal(sheet.entries.length, 2);
assert.equal(sheet.entries[0]?.email, "sarah@kw.com");
assert.equal(sheet.entries[1]?.name, "Jamie Cole");
assert.equal(sheet.entries[1]?.email, "jamie@example.com");
assert.deepEqual(sheet.invalid, ["not an email"]);
assert.equal(nameFromEmail("sarah.chen@kw.com"), "Sarah Chen");

const contact = (partial: Partial<Contact> & Pick<Contact, "id" | "name" | "email">): Contact => ({
  clientId: null,
  title: "",
  phone: "",
  ownerStaffId: "",
  isReferralPartner: false,
  listingWatchUrl: "",
  listingWatchEnabled: false,
  ...partial,
});

const recipients = resolveListAudience(
  ["a", "b", "missing"],
  [
    contact({ id: "a", name: "Sarah Chen", email: "sarah@kw.com" }),
    contact({ id: "b", name: "No Mail", email: "" }),
    contact({ id: "c", name: "Other", email: "other@example.com" }),
  ],
);
assert.equal(recipients.length, 1);
assert.equal(recipients[0]?.email, "sarah@kw.com");

console.log("marketing lists ok");
