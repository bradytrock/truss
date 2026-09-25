import assert from "node:assert/strict";
import {
  mycrmsimSendBody,
  normalizeMycrmsimChannel,
  parseMycrmsimWebhook,
} from "./mycrmsim.ts";

assert.equal(normalizeMycrmsimChannel("iMessage"), "imessage");
assert.equal(normalizeMycrmsimChannel("nope"), "sms");

const inbound = parseMycrmsimWebhook({
  type: "MESSAGE",
  location_id: "loc_1",
  phone: "+12145550100",
  message: "On my way",
  isMe: false,
  attachments: ["https://cdn.example/a.jpg"],
});
assert.equal(inbound.kind, "message");
if (inbound.kind === "message") {
  assert.equal(inbound.locationId, "loc_1");
  assert.equal(inbound.message, "On my way");
  assert.equal(inbound.isMe, false);
  assert.equal(inbound.mediaUrl, "https://cdn.example/a.jpg");
}

const echo = parseMycrmsimWebhook({
  type: "MESSAGE",
  location_id: "loc_1",
  phone: "+12145550100",
  message: "We sent this",
  isMe: true,
});
assert.equal(echo.kind, "message");
if (echo.kind === "message") assert.equal(echo.isMe, true);

const status = parseMycrmsimWebhook({
  type: "STATUS-UPDATE",
  location_id: "loc_1",
  message_id: "msg_9",
  status: "DELIVERED",
});
assert.deepEqual(status, {
  kind: "status",
  locationId: "loc_1",
  messageId: "msg_9",
  status: "DELIVERED",
  phone: "",
});

const call = parseMycrmsimWebhook({
  type: "CALL",
  location_id: "loc_1",
  phone: "+12145550100",
  message: "CALL: 0 sec (Missed)",
  isMe: false,
  attachments: [],
});
assert.equal(call.kind, "call");

assert.equal(
  parseMycrmsimWebhook({ from_number: "+12145550100", content: "old sendblue", is_outbound: false }).kind,
  "ignore",
);

assert.deepEqual(
  mycrmsimSendBody({
    locationId: "loc_1",
    userId: "staff_1",
    phone: "+12145550100",
    message: "Hello",
    messageId: "msg_1",
    channel: "sms",
  }),
  {
    location_id: "loc_1",
    user_id: "staff_1",
    phone: "+12145550100",
    message: "Hello",
    message_id: "msg_1",
    channel: "sms",
  },
);

console.log("mycrmsim tests ok");
