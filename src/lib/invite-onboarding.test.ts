import assert from "node:assert/strict";
import {
  inviteBlockReason,
  inviteCanRenew,
  JOB_RADIUS_DEFAULT,
  oauthFinishUrl,
  oauthReturnPath,
  onboardingTasksFromJson,
  openOnboardingTasks,
  parseInviteGate,
  phoneReady,
  radiusReady,
  timeZoneOptions,
} from "./invite-onboarding.ts";

const gate = parseInviteGate({
  status: "accepted",
  companyName: "Demo Contracting, LLC",
  seatName: "Jake Alvarez",
  seatTitle: "Project Manager",
  seatRole: "project_manager",
  email: "jake@demo.test",
  expiresAt: "2026-10-20T00:00:00Z",
  reinviteRequested: false,
});
assert.equal(gate.status, "accepted");
assert.equal(gate.companyName, "Demo Contracting, LLC");
assert.equal(parseInviteGate({ status: "nope" }).status, "missing");
assert.equal(parseInviteGate(null).status, "missing");

assert.equal(inviteCanRenew("expired"), true);
assert.equal(inviteCanRenew("used"), true);
assert.equal(inviteCanRenew("declined"), true);
assert.equal(inviteCanRenew("open"), false);
assert.equal(inviteCanRenew("missing"), false);
assert.match(inviteBlockReason("declined"), /declined/);

assert.equal(phoneReady("(303) 555-0140"), true);
assert.equal(phoneReady("3035550140"), true);
assert.equal(phoneReady("555-0140"), false);
assert.equal(radiusReady(JOB_RADIUS_DEFAULT), true);
assert.equal(radiusReady(12), false);
assert.equal(radiusReady(100), true);

const tasks = onboardingTasksFromJson({ profile: "2026-10-15T00:00:00Z", calendar: "", lead: 1 });
assert.equal(tasks.profile?.startsWith("2026"), true);
assert.equal(tasks.calendar, undefined);
assert.deepEqual(openOnboardingTasks(tasks, { calendar: true, gmail: false }), [
  "calendar",
  "lead",
  "photo",
]);
assert.deepEqual(openOnboardingTasks({ profile: "1", lead: "1", photo: "1" }, { calendar: false, gmail: false }), []);

assert.equal(oauthReturnPath("/welcome"), "/welcome");
assert.equal(oauthReturnPath("/welcome?google=connected"), "/welcome");
assert.equal(oauthReturnPath("//evil.test"), null);
assert.equal(oauthReturnPath("https://evil.test"), null);
assert.equal(oauthReturnPath("/settings"), null);
assert.equal(oauthFinishUrl("https://app.truss.test", "/welcome", "/calendar").pathname, "/welcome");
assert.equal(oauthFinishUrl("https://app.truss.test", "/settings", "/mail").pathname, "/mail");

const zones = timeZoneOptions("America/Denver");
assert.equal(zones[0], "America/New_York");
const extra = timeZoneOptions("Europe/London");
assert.equal(extra[0], "Europe/London");

console.log("invite-onboarding.test.ts ok");
