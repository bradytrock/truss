import assert from "node:assert/strict";
import { callingWebhookUrl } from "./config.ts";

assert.equal(callingWebhookUrl("https://crmtrock.com", ""), "");
assert.equal(callingWebhookUrl("https://crmtrock.com/", "   "), "");
assert.equal(callingWebhookUrl("https://crmtrock.com", "{token}"), "");
assert.equal(
  callingWebhookUrl("https://crmtrock.com/", "abc123"),
  "https://crmtrock.com/api/calls/webhook/abc123",
);
