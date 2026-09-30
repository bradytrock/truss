import assert from "node:assert/strict";
import { inboundSkipReason, inboundTextFields } from "./inbound-text.ts";

const photon = {
  type: "message.received",
  sender: { id: "+15551212" },
  content: { text: "On my way" },
  message: { id: "msg_1" },
};

assert.equal(inboundSkipReason(photon), null);
assert.deepEqual(inboundTextFields(photon), {
  from: "+15551212",
  content: "On my way",
  handle: "msg_1",
  mediaUrl: "",
  sentAt: null,
});

assert.equal(inboundSkipReason({ is_outbound: true, content: "echo" }), "outbound");
assert.equal(inboundSkipReason({ direction: "outbound" }), "outbound");
assert.equal(inboundSkipReason({ message: { direction: "outbound" } }), "outbound");
assert.equal(inboundSkipReason({ message: { isFromMe: true } }), "outbound");
assert.equal(inboundSkipReason({ type: "message.read" }), "ignored_event");

assert.equal(
  inboundTextFields({ from_number: "+15550001", content: "Hi", message_handle: "h1", media_url: "https://example.test/a.jpg", date_sent: "2026-09-30T00:00:00Z" }).from,
  "+15550001",
);

console.log("inbound-text.test.ts ok");
