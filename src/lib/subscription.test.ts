import assert from "node:assert/strict";
import {
  DEMO_SCHEDULE_URL,
  companySubscriptionActive,
  isSubscriptionExemptPath,
  shouldForceDemo,
  subscriptionActiveFromRpc,
} from "./subscription.ts";

assert.equal(DEMO_SCHEDULE_URL, "https://theroofingcrm.com/");

assert.equal(companySubscriptionActive({ subscription_active: true }), true);
assert.equal(companySubscriptionActive({ subscription_active: false }), false);
assert.equal(companySubscriptionActive({ name: "T-Rock" }), true);
assert.equal(companySubscriptionActive(null), false);
assert.equal(companySubscriptionActive(undefined), false);

assert.equal(isSubscriptionExemptPath("/login"), true);
assert.equal(isSubscriptionExemptPath("/signup"), true);
assert.equal(isSubscriptionExemptPath("/auth/callback"), true);
assert.equal(isSubscriptionExemptPath("/privacy"), true);
assert.equal(isSubscriptionExemptPath("/share/e/abc"), true);
assert.equal(isSubscriptionExemptPath("/api/voice/intake"), true);
assert.equal(isSubscriptionExemptPath("/api/cron/tasks"), true);
assert.equal(isSubscriptionExemptPath("/"), false);
assert.equal(isSubscriptionExemptPath("/jobs"), false);
assert.equal(isSubscriptionExemptPath("/api/messages/send"), false);

assert.equal(
  shouldForceDemo({ signedIn: true, pathname: "/jobs", subscriptionActive: false }),
  true,
);
assert.equal(
  shouldForceDemo({ signedIn: true, pathname: "/jobs", subscriptionActive: true }),
  false,
);
assert.equal(
  shouldForceDemo({ signedIn: true, pathname: "/login", subscriptionActive: false }),
  false,
);
assert.equal(
  shouldForceDemo({ signedIn: false, pathname: "/jobs", subscriptionActive: false }),
  false,
);

assert.equal(subscriptionActiveFromRpc({ data: true, error: null }), true);
assert.equal(subscriptionActiveFromRpc({ data: false, error: null }), false);
assert.equal(subscriptionActiveFromRpc({ data: false, error: { message: "missing" } }), true);

console.log("subscription.test.ts ok");
