import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyStripeSignature } from "./stripe-server.ts";
import { centsToDollars, dollarsToCents, parseCheckoutKind } from "./stripe-checkout.ts";

const secret = "whsec_test";
const payload = '{"type":"checkout.session.completed"}';
const timestamp = Math.floor(Date.now() / 1000);
const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");

assert.equal(verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret), true);
assert.equal(verifyStripeSignature(payload, `t=${timestamp},v1=deadbeef`, secret), false);
assert.equal(verifyStripeSignature(payload, "", secret), false);
assert.equal(dollarsToCents(125.5), 12550);
assert.equal(centsToDollars(12550), 125.5);
assert.equal(parseCheckoutKind("invoice"), "invoice");
assert.equal(parseCheckoutKind("deposit"), "deposit");
assert.equal(parseCheckoutKind("check"), null);

console.log("stripe-server tests passed");
