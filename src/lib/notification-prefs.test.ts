import assert from "node:assert/strict";
import {
  ALERTS,
  alertsForMember,
  allowsNotification,
  parseNotificationPrefs,
  prefsSignature,
  sectionCanToggle,
  setAlertsChannels,
  setNotificationChannel,
} from "./notification-prefs.ts";

const pm = alertsForMember("project_manager", "pm", []);
assert.equal(pm.some((alert) => alert.id === "lead_assigned_you"), true);
assert.equal(pm.some((alert) => alert.id === "lead_needs_rep"), false);
assert.equal(pm.some((alert) => alert.id === "stripe_revoke"), false);
assert.equal(pm.some((alert) => alert.id === "weather_watch"), false);
assert.equal(pm.some((alert) => alert.id === "proposal_opened"), true);

const admin = alertsForMember("company_admin", "admin", []);
assert.equal(admin.some((alert) => alert.id === "stripe_revoke"), true);
assert.equal(admin.some((alert) => alert.id === "lead_passed_back"), true);
assert.equal(admin.some((alert) => alert.id === "weather_watch"), true);

const director = alertsForMember("director", "dir", []);
assert.equal(director.some((alert) => alert.id === "stripe_revoke"), false);
assert.equal(director.some((alert) => alert.id === "lead_needs_rep"), true);

const namedLead = alertsForMember("project_manager", "lead", [{ leadStaffId: "lead" }]);
assert.equal(namedLead.some((alert) => alert.id === "lead_assigned_team"), true);
assert.equal(namedLead.some((alert) => alert.id === "weather_watch"), true);

assert.equal(allowsNotification({}, "weather_warning", "text"), true);
assert.equal(allowsNotification({ weather_warning: { text: false } }, "weather_warning", "text"), true);
assert.equal(allowsNotification({}, "lead_assigned_you", "in_app"), true);
assert.equal(allowsNotification({}, "proposal_opened", "email"), true);
assert.equal(allowsNotification({ proposal_opened: { email: false } }, "proposal_opened", "email"), false);
assert.equal(allowsNotification({}, "proposal_opened", "in_app"), true);
assert.equal(allowsNotification({}, "stripe_revoke", "text"), false);

const silenced = setNotificationChannel({}, "proposal_opened", "text", false);
assert.equal(allowsNotification(silenced, "proposal_opened", "text"), false);
assert.equal(allowsNotification(silenced, "proposal_opened", "email"), true);
const restored = setNotificationChannel(silenced, "proposal_opened", "text", true);
assert.deepEqual(restored, {});

const lockedAttempt = setNotificationChannel({}, "weather_warning", "text", false);
assert.deepEqual(lockedAttempt, {});

const allOff = setAlertsChannels({}, ALERTS, false);
assert.equal(allowsNotification(allOff, "proposal_opened", "email"), false);
assert.equal(allowsNotification(allOff, "weather_warning", "text"), true);
assert.equal(allowsNotification(allOff, "stripe_revoke", "email"), true);
assert.equal(allowsNotification(allOff, "lead_assigned_you", "in_app"), true);
assert.notEqual(prefsSignature(allOff), prefsSignature({}));

const parsed = parseNotificationPrefs({
  proposal_opened: { email: false, text: "nope", extra: false },
  weather_warning: { text: false },
  not_an_alert: { email: false },
  missed_call: { text: true, email: false },
});
assert.deepEqual(parsed, {
  proposal_opened: { email: false },
  missed_call: { email: false },
});

const account = ALERTS.filter((alert) => alert.section === "account");
assert.equal(sectionCanToggle(account), false);
const weather = ALERTS.filter((alert) => alert.section === "weather");
assert.equal(sectionCanToggle(weather), true);

console.log("notification-prefs.test.ts ok");
