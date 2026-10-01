import assert from "node:assert/strict";
import { inboundMessages, inboundSkipReason, inboundTextFields } from "./inbound-text.ts";

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

const spectrum = {
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
};

assert.equal(inboundSkipReason(spectrum), null);
assert.deepEqual(inboundMessages(spectrum), [
  {
    from: "+15550100",
    content: "hey, what time is dinner?",
    handle: "spc-msg-1",
    mediaUrl: "",
    sentAt: "2026-05-14T19:06:32.000Z",
  },
]);

assert.deepEqual(
  inboundMessages({
    event: "messages",
    message: {
      id: "spc-msg-1:reaction:1",
      timestamp: "2026-05-14T19:07:00.000Z",
      sender: { id: "+15550100" },
      content: {
        type: "reaction",
        emoji: "👍",
        target: { id: "spc-msg-1", contentPreview: "hey, what time is dinner?" },
      },
    },
  }),
  [
    {
      from: "+15550100",
      content: "Liked “hey, what time is dinner?”",
      handle: "spc-msg-1:reaction:1",
      mediaUrl: "",
      sentAt: "2026-05-14T19:07:00.000Z",
    },
  ],
);

assert.equal(
  inboundMessages({
    event: "messages",
    message: {
      id: "love-1",
      sender: { id: "+15550100" },
      content: { type: "reaction", emoji: "❤️", target: { contentPreview: "See you then" } },
    },
  })[0]?.content,
  "Loved “See you then”",
);

assert.equal(
  inboundMessages({
    event: "messages",
    message: {
      id: "photo-1",
      sender: { id: "+15550100" },
      content: { type: "attachment", id: "guid-1", name: "IMG_4351.HEIC", mimeType: "image/heic", size: 100 },
    },
  })[0]?.content,
  "Photo · IMG_4351.HEIC",
);

assert.deepEqual(
  inboundMessages({
    event: "messages",
    message: {
      id: "album-1",
      sender: { id: "+15550100" },
      timestamp: "2026-05-14T19:06:32.000Z",
      content: {
        type: "group",
        items: [
          {
            id: "p:0/album-1",
            sender: { id: "+15550100" },
            timestamp: "2026-05-14T19:06:32.000Z",
            content: { type: "attachment", name: "IMG_4351.HEIC", mimeType: "image/heic" },
          },
          {
            id: "p:1/album-1",
            sender: { id: "+15550100" },
            content: { type: "attachment", name: "note.pdf", mimeType: "application/pdf" },
          },
        ],
      },
    },
  }).map((row) => row.content),
  ["Photo · IMG_4351.HEIC", "File · note.pdf"],
);

assert.equal(
  inboundMessages({
    event: "messages",
    message: {
      id: "link-1",
      sender: { id: "+15550100" },
      content: { type: "richlink", url: "https://example.test/roof" },
    },
  })[0]?.content,
  "https://example.test/roof",
);

assert.equal(inboundMessages({ event: "messages", message: { id: "type-1", content: { type: "typing" } } }).length, 0);

assert.equal(inboundSkipReason({ is_outbound: true, content: "echo" }), "outbound");
assert.equal(inboundSkipReason({ direction: "outbound" }), "outbound");
assert.equal(inboundSkipReason({ message: { direction: "outbound" } }), "outbound");
assert.equal(inboundSkipReason({ message: { isFromMe: true } }), "outbound");
assert.equal(inboundSkipReason({ type: "message.read" }), "ignored_event");
assert.equal(inboundSkipReason({ event: "typing" }), "ignored_event");

assert.equal(
  inboundTextFields({
    from_number: "+15550001",
    content: "Hi",
    message_handle: "h1",
    media_url: "https://example.test/a.jpg",
    date_sent: "2026-09-30T00:00:00Z",
  }).from,
  "+15550001",
);

console.log("inbound-text.test.ts ok");
