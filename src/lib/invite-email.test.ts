import assert from "node:assert/strict";
import { inviteSignupUrl } from "./accounts.ts";
import {
  canEmailInvite,
  inviteEmailAllowed,
  inviteEmailHtml,
  inviteEmailSubject,
  inviteEmailText,
  parseInviteEmailStaffIds,
} from "./invite-email.ts";

const urlA = inviteSignupUrl("https://app.truss.test", "token_alex");
const urlB = inviteSignupUrl("https://app.truss.test", "token_jordan");

assert.notEqual(urlA, urlB);
assert.match(urlA, /invite=token_alex/);
assert.match(urlB, /invite=token_jordan/);

const subject = inviteEmailSubject("T-Rock Roofing");
assert.equal(subject, "Join T-Rock Roofing");

const text = inviteEmailText({
  company: "T-Rock Roofing",
  seatName: "Alex Rivera",
  seatTitle: "Superintendent",
  inviterName: "Brady",
  signupUrl: urlA,
});
assert.match(text, /Alex Rivera/);
assert.match(text, /added you/);
assert.match(text, /token_alex/);
assert.doesNotMatch(text, /token_jordan/);

const html = inviteEmailHtml({
  company: "T-Rock Roofing",
  seatName: "Alex Rivera",
  seatTitle: "Superintendent",
  inviterName: "Brady",
  signupUrl: urlA,
});
assert.match(html, /Accept invitation/);
assert.match(html, /token_alex/);
assert.doesNotMatch(html, /token_jordan/);
assert.match(html, /added you/);

assert.equal(inviteEmailAllowed(urlA, "https://app.truss.test"), true);
assert.equal(inviteEmailAllowed(urlB, "https://other.test"), false);
assert.equal(inviteEmailAllowed("https://app.truss.test/signup", "https://app.truss.test"), false);
assert.equal(canEmailInvite("alex@company.com"), true);
assert.equal(canEmailInvite("not-an-email"), false);

assert.deepEqual(parseInviteEmailStaffIds({ staffId: " a " }), ["a"]);
assert.deepEqual(parseInviteEmailStaffIds({ staffIds: ["a", "a", "b", ""] }), ["a", "b"]);

console.log("invite-email.test.ts ok");
