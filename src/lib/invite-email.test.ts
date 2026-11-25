import assert from "node:assert/strict";
import { inviteSignupUrl } from "./accounts.ts";
import {
  canEmailInvite,
  inviteEmailAllowed,
  inviteEmailHtml,
  inviteEmailLogoUrl,
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
assert.match(text, /Your invitation/);
assert.match(text, /You are invited to join T-Rock Roofing/);
assert.match(text, /expire in 14 days/);
assert.match(text, /token_alex/);
assert.doesNotMatch(text, /token_jordan/);
assert.doesNotMatch(text, /added you/);

const html = inviteEmailHtml({
  company: "T-Rock Roofing",
  seatName: "Alex Rivera",
  seatTitle: "Superintendent",
  inviterName: "Brady",
  signupUrl: urlA,
});
assert.match(html, /Your invitation/);
assert.match(html, /You are invited to join T-Rock Roofing/);
assert.match(html, /expire in 14 days/);
assert.match(html, /Accept invitation/);
assert.match(html, /click here/);
assert.match(html, /© \d{4} T-Rock Roofing/);
assert.match(html, /border-radius:8px/);
assert.match(html, /token_alex/);
assert.doesNotMatch(html, /token_jordan/);
assert.doesNotMatch(html, /added you/);
assert.doesNotMatch(html, /<img /);

const branded = inviteEmailHtml({
  company: "T-Rock Roofing",
  seatName: "Alex Rivera",
  seatTitle: "Superintendent",
  inviterName: "Brady",
  signupUrl: urlA,
  logoUrl: "https://cdn.test/logo.png",
  headline: "Welcome aboard",
  message: "Brady added you.\n\nSee you Monday.",
  button: "Join now",
});
assert.match(branded, /src="https:\/\/cdn\.test\/logo\.png"/);
assert.match(branded, /alt="T-Rock Roofing"/);
assert.match(branded, /Welcome aboard/);
assert.match(branded, /Brady added you\./);
assert.match(branded, /See you Monday\./);
assert.match(branded, />Join now</);
assert.doesNotMatch(branded, /You are invited to join/);

const escaped = inviteEmailHtml({
  company: "A & B <Roofing>",
  seatName: "Alex",
  seatTitle: "",
  inviterName: "Brady",
  signupUrl: urlA,
  logoUrl: "javascript:alert(1)",
  message: "<script>alert(1)</script>",
});
assert.match(escaped, /A &amp; B &lt;Roofing&gt;/);
assert.match(escaped, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.doesNotMatch(escaped, /<script>/);
assert.doesNotMatch(escaped, /javascript:/);

assert.equal(inviteEmailLogoUrl("https://cdn.test/logo.png"), "https://cdn.test/logo.png");
assert.equal(inviteEmailLogoUrl("/logos/mark.png", "https://app.truss.test"), "https://app.truss.test/logos/mark.png");
assert.equal(inviteEmailLogoUrl("javascript:alert(1)", "https://app.truss.test"), "");
assert.equal(inviteEmailLogoUrl(""), "");

assert.equal(inviteEmailAllowed(urlA, "https://app.truss.test"), true);
assert.equal(inviteEmailAllowed(urlB, "https://other.test"), false);
assert.equal(inviteEmailAllowed("https://app.truss.test/signup", "https://app.truss.test"), false);
assert.equal(canEmailInvite("alex@company.com"), true);
assert.equal(canEmailInvite("not-an-email"), false);

assert.deepEqual(parseInviteEmailStaffIds({ staffId: " a " }), ["a"]);
assert.deepEqual(parseInviteEmailStaffIds({ staffIds: ["a", "a", "b", ""] }), ["a", "b"]);

console.log("invite-email.test.ts ok");
