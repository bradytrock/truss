import assert from "node:assert/strict";
import {
  CASSIO_SILENCE,
  cassioAudience,
  cassioMayAnswer,
  guardToolText,
  isCassioYes,
  parseZerosettleMessages,
  publicSeedLine,
  redactFinancials,
  textHasFinancials,
} from "./cassio-guard.ts";

const owner = ["+16195550100"];
const now = 1_700_000_000_000;

function inbound(partial: { chatId?: string; handle: string; text: string; ts?: number }) {
  return {
    chatId: partial.chatId ?? "",
    handle: partial.handle,
    text: partial.text,
    direction: "in",
    ts: partial.ts ?? now,
  };
}

assert.equal(
  cassioAudience({ messages: [inbound({ handle: "+16195550100", text: "Has Bryce opened it?" })], ownerPhones: owner, now }),
  "owner_dm",
);
assert.equal(cassioMayAnswer("owner_dm"), true);
assert.equal(
  cassioAudience({
    messages: [inbound({ chatId: "iMessage;+;chat1", handle: "+16195550100", text: "Has Bryce opened it?" })],
    ownerPhones: owner,
    seedChatId: "iMessage;+;chat1",
    now,
  }),
  "seeds",
);
assert.equal(cassioMayAnswer("seeds"), true);
assert.equal(
  cassioAudience({
    messages: [inbound({ chatId: "iMessage;+;other", handle: "+16195550100", text: "Has Bryce opened it?" })],
    ownerPhones: owner,
    seedChatId: "iMessage;+;chat1",
    now,
  }),
  "group",
);
assert.equal(cassioMayAnswer("group"), false);
assert.equal(
  cassioAudience({ messages: [inbound({ handle: "+13125550199", text: "What's the balance?" })], ownerPhones: owner, now }),
  "other",
);
assert.equal(
  cassioAudience({
    messages: [
      inbound({ handle: "+16195550100", text: "status?", ts: now }),
      inbound({ chatId: "iMessage;+;chat1", handle: "+13125550199", text: "status?", ts: now - 5_000 }),
    ],
    ownerPhones: owner,
    now,
  }),
  "unknown",
);
assert.equal(cassioAudience({ messages: [], ownerPhones: owner, now }), "unknown");
assert.equal(cassioMayAnswer("unknown"), false);
assert.equal(cassioMayAnswer("other"), false);

assert.equal(guardToolText("group", "Bryce Jones estimate 1042"), CASSIO_SILENCE);
assert.equal(guardToolText("seeds", "Bryce Jones estimate 1042"), "Bryce Jones estimate 1042");
assert.equal(guardToolText("seeds", "Balance due $1,200"), CASSIO_SILENCE);
assert.equal(guardToolText("owner_dm", "Balance due $1,200"), "Balance due $1,200");
assert.equal(guardToolText("seeds", "Balance due $1,200"), CASSIO_SILENCE);
assert.equal(guardToolText("owner_dm", "Bryce Jones opened estimate 1042"), "Bryce Jones opened estimate 1042");

assert.equal(isCassioYes("YES"), true);
assert.equal(isCassioYes("yes send the total"), false);
assert.equal(textHasFinancials("contract value is high"), true);
assert.equal(publicSeedLine("Lead update: Bryce Jones · Estimating · 12 Oak"), "Lead update: Bryce Jones · Estimating · 12 Oak");
assert.equal(publicSeedLine("Lead update: Bryce · $8400"), "");
assert.equal(redactFinancials("Two layers, budget $8,400, architectural"), "Two layers, budget, architectural");

const parsed = parseZerosettleMessages({
  messages: [{ direction: "in", handle: "+16195550100", text: "hi", ts_ms: 5, chat_id: "iMessage;+;chat9" }],
});
assert.equal(parsed[0]?.chatId, "iMessage;+;chat9");

console.log("cassio-guard.test.ts ok");
