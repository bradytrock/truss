import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  authorizeInboundWebhook,
  parseInboundText,
  verifySpectrumSignature,
} from "../../supabase/functions/_shared/photon-webhook.ts";

const secret = "test-signing-secret";
const rawBody = JSON.stringify({
  event: "messages",
  space: { id: "any;-;+15550100", platform: "iMessage", type: "dm", phone: "+15551234567" },
  message: {
    id: "spc-msg-1",
    platform: "iMessage",
    direction: "inbound",
    timestamp: "2026-05-14T19:06:32.000Z",
    sender: { id: "+15550100", platform: "iMessage" },
    content: { type: "text", text: "hey, what time is dinner?" },
  },
});
const timestamp = "1747242392";
const signature =
  "v0=" + createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex");

const signed = verifySpectrumSignature({
  secret,
  timestamp,
  signature,
  rawBody,
  nowMs: Number(timestamp) * 1000,
});
assert.equal(signed.ok, true);

const stale = verifySpectrumSignature({
  secret,
  timestamp,
  signature,
  rawBody,
  nowMs: (Number(timestamp) + 301) * 1000,
});
assert.equal(stale.ok, false);
if (!stale.ok) assert.equal(stale.status, 400);

const forged = verifySpectrumSignature({
  secret,
  timestamp,
  signature: signature.slice(0, -1) + (signature.endsWith("a") ? "b" : "a"),
  rawBody,
  nowMs: Number(timestamp) * 1000,
});
assert.equal(forged.ok, false);

const open = authorizeInboundWebhook({
  secret: "",
  token: "",
  headerToken: "",
  queryToken: "",
  timestamp: "",
  signature: "",
  rawBody,
});
assert.equal(open.ok, true);

const tokenGate = authorizeInboundWebhook({
  secret: "",
  token: "office",
  headerToken: "",
  queryToken: "nope",
  timestamp: "",
  signature: "",
  rawBody,
});
assert.equal(tokenGate.ok, false);

const text = parseInboundText(JSON.parse(rawBody));
assert.equal(text.skip, false);
assert.equal(text.from, "+15550100");
assert.equal(text.body, "hey, what time is dinner?");
assert.equal(text.handle, "spc-msg-1");
assert.equal(text.sentAt, "2026-05-14T19:06:32.000Z");
assert.equal(text.mediaUrl, "");

const photo = parseInboundText({
  event: "messages",
  space: { type: "dm" },
  message: {
    id: "spc-msg-2",
    direction: "inbound",
    sender: { id: "+15550100" },
    content: { type: "attachment", id: "guid", name: "IMG.HEIC", mimeType: "image/heic" },
  },
});
assert.equal(photo.skip, false);
assert.equal(photo.body, "(photo or attachment)");
assert.equal(photo.mediaUrl, "");

const group = parseInboundText({
  event: "messages",
  space: { type: "group" },
  message: {
    id: "spc-msg-3",
    direction: "inbound",
    sender: { id: "+15550100" },
    content: { type: "text", text: "group" },
  },
});
assert.equal(group.skip, true);
assert.equal(group.reason, "group");

const reaction = parseInboundText({
  event: "messages",
  space: { type: "dm" },
  message: {
    id: "spc-msg-4",
    direction: "inbound",
    sender: { id: "+15550100" },
    content: { type: "reaction", emoji: "❤️" },
  },
});
assert.equal(reaction.skip, true);
assert.equal(reaction.reason, "unsupported");

const legacy = parseInboundText(
  {
    from_number: "+15550100",
    content: "still on the old hook",
    message_handle: "sb_1",
    media_url: "https://cdn.example/a.jpg",
    date_sent: "2026-01-01T00:00:00.000Z",
  },
  "+15551234567",
);
assert.equal(legacy.skip, false);
assert.equal(legacy.from, "+15550100");
assert.equal(legacy.body, "still on the old hook");
assert.equal(legacy.handle, "sb_1");
assert.equal(legacy.mediaUrl, "https://cdn.example/a.jpg");

const echo = parseInboundText(
  { from_number: "+1 (555) 123-4567", content: "our own send", is_outbound: false },
  "+15551234567",
);
assert.equal(echo.skip, true);
assert.equal(echo.reason, "outbound");

console.log("photon-webhook.test.ts ok");
