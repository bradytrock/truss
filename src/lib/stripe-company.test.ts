import assert from "node:assert/strict";
import {
  looksLikeStripeSecretKey,
  looksLikeStripeWebhookSecret,
  parseStripeStatus,
  revokeIsPending,
} from "./stripe-company.ts";

assert.equal(looksLikeStripeSecretKey("sk_live_abcdefghijklmnopqrst"), true);
assert.equal(looksLikeStripeSecretKey("sk_test_abcdefghijklmnopqrst"), true);
assert.equal(looksLikeStripeSecretKey("pk_live_abcdefghijklmnopqrst"), false);
assert.equal(looksLikeStripeWebhookSecret("whsec_abcdefghijklmnopqrst"), true);
assert.equal(looksLikeStripeWebhookSecret("sk_live_abcdefghijklmnopqrst"), false);

const locked = parseStripeStatus({ ok: true, connected: true, revokeAt: "2026-09-17T12:00:00.000Z" });
assert.equal(locked.connected, true);
assert.equal(revokeIsPending(locked.revokeAt, Date.parse("2026-09-16T12:00:00.000Z")), true);
assert.equal(revokeIsPending(locked.revokeAt, Date.parse("2026-09-18T12:00:00.000Z")), false);
assert.equal(revokeIsPending(null), false);

console.log("stripe-company tests passed");
