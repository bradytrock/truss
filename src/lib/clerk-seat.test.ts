import assert from "node:assert/strict";
import {
  clerkFailureMessage,
  issueInviteClerkTicket,
  readInviteClerkResponse,
  splitPersonName,
} from "./clerk-seat.ts";

assert.equal(splitPersonName("  Ada Lovelace  ").firstName, "Ada");
assert.equal(splitPersonName("  Ada Lovelace  ").lastName, "Lovelace");
assert.equal(splitPersonName("Ada").lastName, undefined);
assert.equal(splitPersonName("   ").firstName, "Teammate");
assert.equal(clerkFailureMessage({ errors: [{ code: "form_password_pwned", message: "pwned" }] }), "Choose a password that has not appeared in a data breach.");
assert.equal(clerkFailureMessage(new Error("nope")), "nope");

const calls: string[] = [];
const deps = {
  loadInvite: async () => ({ status: "accepted" as const, email: "Jake@Demo.test" }),
  findClerkUserId: async () => {
    calls.push("find");
    return null;
  },
  createClerkUser: async () => {
    calls.push("create");
    return "user_1";
  },
  passwordMatchesClerk: async () => {
    calls.push("verify");
    return false;
  },
  claimSeat: async () => {
    calls.push("claim");
  },
  createTicket: async (userId: string) => {
    calls.push(`ticket:${userId}`);
    return "ticket_1";
  },
  deleteClerkUser: async () => {
    calls.push("delete");
  },
};

const created = await issueInviteClerkTicket({
  configured: true,
  token: "tok",
  password: "long-password",
  fullName: "Ada Lovelace",
  ...deps,
});
assert.deepEqual(created, { ok: true, ticket: "ticket_1" });
assert.deepEqual(calls, ["find", "create", "claim", "ticket:user_1"]);

const skipped = await issueInviteClerkTicket({
  configured: false,
  token: "tok",
  password: "long-password",
  fullName: "Ada",
  ...deps,
  claimSeat: async () => {
    throw new Error("should not run");
  },
});
assert.deepEqual(skipped, { ok: true, skipped: true });

const open = await issueInviteClerkTicket({
  configured: true,
  token: "tok",
  password: "long-password",
  fullName: "Ada",
  ...deps,
  loadInvite: async () => ({ status: "open", email: "ada@demo.test" }),
  claimSeat: async () => {
    throw new Error("should not run");
  },
});
assert.equal(open.ok, false);
if (!open.ok) assert.equal(open.error, "Accept the invitation before creating the account.");

const mismatch = await issueInviteClerkTicket({
  configured: true,
  token: "tok",
  password: "long-password",
  fullName: "Ada",
  ...deps,
  findClerkUserId: async () => "user_existing",
  createTicket: async () => {
    throw new Error("should not ticket");
  },
});
assert.equal(mismatch.ok, false);
if (!mismatch.ok) assert.match(mismatch.error, /different password/);

const resumed = await issueInviteClerkTicket({
  configured: true,
  token: "tok",
  password: "long-password",
  fullName: "Ada",
  ...deps,
  findClerkUserId: async () => "user_existing",
  passwordMatchesClerk: async () => true,
  createClerkUser: async () => {
    throw new Error("should not create");
  },
});
assert.deepEqual(resumed, { ok: true, ticket: "ticket_1" });

let finds = 0;
const raced = await issueInviteClerkTicket({
  configured: true,
  token: "tok",
  password: "long-password",
  fullName: "Ada",
  ...deps,
  findClerkUserId: async () => {
    finds += 1;
    return finds === 1 ? null : "user_raced";
  },
  createClerkUser: async () => {
    throw { errors: [{ code: "form_identifier_exists" }] };
  },
  passwordMatchesClerk: async () => true,
});
assert.deepEqual(raced, { ok: true, ticket: "ticket_1" });

const deleted: string[] = [];
const unlinked = await issueInviteClerkTicket({
  configured: true,
  token: "tok",
  password: "long-password",
  fullName: "Ada",
  ...deps,
  claimSeat: async () => {
    throw new Error("Could not attach this login to your profile.");
  },
  deleteClerkUser: async (userId) => {
    deleted.push(userId);
  },
  createTicket: async () => {
    throw new Error("should not ticket");
  },
});
assert.equal(unlinked.ok, false);
assert.deepEqual(deleted, ["user_1"]);

assert.deepEqual(readInviteClerkResponse(200, { skipped: true }), { kind: "skipped" });
assert.deepEqual(readInviteClerkResponse(200, { ticket: " ticket_9 " }), { kind: "ticket", ticket: "ticket_9" });
assert.equal(readInviteClerkResponse(409, { error: "nope" }).kind, "error");
assert.equal(readInviteClerkResponse(500, null).kind, "error");

console.log("clerk-seat.test.ts ok");
