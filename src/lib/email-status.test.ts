import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  emailStatusFromEventType,
  emailStatusLabel,
  emailStatusNeedsRefresh,
  nextEmailStatus,
  outboundEmailActivityBody,
} from "./email-status.ts";
import { verifyResendWebhook } from "./email-webhook.ts";

assert.equal(nextEmailStatus("", "queued"), "queued");
assert.equal(nextEmailStatus("queued", "sent"), "sent");
assert.equal(nextEmailStatus("sent", "delivered"), "delivered");
assert.equal(nextEmailStatus("delivered", "sent"), "delivered");
assert.equal(nextEmailStatus("delivered", "bounced"), "delivered");
assert.equal(nextEmailStatus("sent", "bounced"), "bounced");
assert.equal(nextEmailStatus("delivered", "opened"), "opened");
assert.equal(nextEmailStatus("opened", "clicked"), "clicked");
assert.equal(nextEmailStatus("clicked", "opened"), "clicked");
assert.equal(nextEmailStatus("delivered", "not-a-status"), "delivered");

assert.equal(emailStatusNeedsRefresh("queued"), true);
assert.equal(emailStatusNeedsRefresh("delivery_delayed"), true);
assert.equal(emailStatusNeedsRefresh("delivered"), false);
assert.equal(emailStatusNeedsRefresh("bounced"), false);
assert.equal(emailStatusNeedsRefresh(""), false);

assert.equal(emailStatusFromEventType("email.delivered"), "delivered");
assert.equal(emailStatusFromEventType("email.delivery_delayed"), "delivery_delayed");
assert.equal(emailStatusFromEventType("contact.created"), "");
assert.equal(emailStatusLabel("complained"), "Marked spam");

assert.equal(
  outboundEmailActivityBody({
    name: "Jane Roe",
    to: "jane@example.com",
    subject: "Proposal 1042",
    url: "https://app.example/share/e/abc",
  }),
  "Emailed Jane Roe (jane@example.com): Proposal 1042 — https://app.example/share/e/abc",
);
assert.match(
  outboundEmailActivityBody({
    name: "Jane Roe",
    to: "jane@example.com",
    subject: "Proposal 1042",
    failed: true,
    error: "Mailbox not found",
  }),
  /Could not email Jane Roe \(jane@example.com\): Proposal 1042\. Mailbox not found/,
);

const secretBytes = Buffer.from("test-secret");
const secret = `whsec_${secretBytes.toString("base64")}`;
const body = JSON.stringify({ type: "email.delivered", data: { email_id: "email_1" } });
const id = "msg_1";
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${body}`).digest("base64");

assert.equal(
  verifyResendWebhook({
    payload: body,
    secret,
    id,
    timestamp,
    signature: `v1,${signature}`,
  }),
  true,
);
assert.equal(
  verifyResendWebhook({
    payload: `${body} `,
    secret,
    id,
    timestamp,
    signature: `v1,${signature}`,
  }),
  false,
);
assert.equal(
  verifyResendWebhook({
    payload: body,
    secret,
    id,
    timestamp: String(Math.floor(Date.now() / 1000) - 60 * 30),
    signature: `v1,${signature}`,
  }),
  false,
);
assert.equal(
  verifyResendWebhook({
    payload: body,
    secret: "",
    id,
    timestamp,
    signature: `v1,${signature}`,
  }),
  false,
);
