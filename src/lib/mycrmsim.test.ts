import assert from "node:assert/strict";
import { parseTextWebhookPayload } from "./mycrmsim.ts";

const inbound = parseTextWebhookPayload({
  type: "MESSAGE",
  location_id: "loc_1",
  phone: "+15551234567",
  message: "Gate is unlocked",
  isMe: false,
  attachments: [],
});
assert.deepEqual(inbound, {
  kind: "inbound",
  from: "+15551234567",
  body: "Gate is unlocked",
  handle: "",
  mediaUrl: "",
  sentAt: null,
});

const echo = parseTextWebhookPayload({
  type: "MESSAGE",
  phone: "+15551234567",
  message: "On our way",
  isMe: true,
});
assert.equal(echo.kind, "outbound-echo");

const status = parseTextWebhookPayload({
  type: "STATUS-UPDATE",
  status: "DELIVERED",
  message_id: "abc",
});
assert.equal(status.kind, "status");

const call = parseTextWebhookPayload({
  type: "CALL",
  phone: "+15551234567",
  message: "CALL: 0 sec (Missed)",
  isMe: false,
});
assert.equal(call.kind, "call");

const wrongLocation = parseTextWebhookPayload(
  {
    type: "MESSAGE",
    location_id: "other",
    phone: "+15551234567",
    message: "Hi",
  },
  { locationId: "loc_1" },
);
assert.deepEqual(wrongLocation, { kind: "skip", reason: "location" });

const sendblueShape = parseTextWebhookPayload({
  from_number: "(555) 123-4567",
  content: "Old webhook",
  message_handle: "sb_1",
  date_sent: "2026-09-25T12:00:00.000Z",
});
assert.equal(sendblueShape.kind, "inbound");
if (sendblueShape.kind === "inbound") {
  assert.equal(sendblueShape.from, "(555) 123-4567");
  assert.equal(sendblueShape.body, "Old webhook");
  assert.equal(sendblueShape.handle, "sb_1");
}

const photo = parseTextWebhookPayload({
  type: "MESSAGE",
  phone: "+15550001111",
  message: "",
  attachments: ["https://files.example.com/roof.jpg"],
});
assert.equal(photo.kind, "inbound");
if (photo.kind === "inbound") {
  assert.equal(photo.body, "(photo or attachment)");
  assert.equal(photo.mediaUrl, "https://files.example.com/roof.jpg");
}

const ourNumber = parseTextWebhookPayload(
  { phone: "+15559876543", message: "loop" },
  { fromNumber: "+1 (555) 987-6543" },
);
assert.equal(ourNumber.kind, "outbound-echo");

console.log("mycrmsim.test.ts ok");
