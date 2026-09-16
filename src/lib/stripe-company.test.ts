import assert from "node:assert/strict";
import {
  companyStripeWebhookUrl,
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

const token = "a".repeat(48);
const parsed = parseStripeStatus({
  ok: true,
  connected: true,
  webhookToken: token,
});
assert.equal(parsed.webhookToken, token);
assert.equal(
  companyStripeWebhookUrl("https://app.truss.test", token),
  `https://app.truss.test/api/stripe/webhook/${token}`,
);
assert.equal(companyStripeWebhookUrl("https://app.truss.test", "short"), "");
assert.notEqual(
  companyStripeWebhookUrl("https://app.truss.test", token),
  companyStripeWebhookUrl("https://app.truss.test", "b".repeat(48)),
);

console.log("stripe-company tests passed");
