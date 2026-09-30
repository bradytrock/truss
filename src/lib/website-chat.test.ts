import assert from "node:assert/strict";
import {
  fallbackChatReplies,
  isPhoneUserAgent,
  messagesAppLink,
  parseSuggestedReplies,
  WEBSITE_CHAT_GREETING,
} from "./website-chat.ts";

assert.equal(isPhoneUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), true);
assert.equal(isPhoneUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile"), true);
assert.equal(isPhoneUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), false);
assert.equal(isPhoneUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), false);

assert.equal(
  messagesAppLink("(469) 931-9867", WEBSITE_CHAT_GREETING, true),
  "sms:+14699319867&body=Hi%2C%20I%20was%20on%20your%20website.",
);
assert.equal(
  messagesAppLink("4699319867", "Hi", false),
  "sms:+14699319867?body=Hi",
);
assert.equal(messagesAppLink("", "Hi", true), "");

assert.deepEqual(parseSuggestedReplies('{"replies":["A","B"]}'), ["A", "B"]);
assert.deepEqual(parseSuggestedReplies("sure {\"replies\":[\"Only this\"]} thanks"), ["Only this"]);
assert.deepEqual(parseSuggestedReplies("not json"), []);
assert.equal(fallbackChatReplies().length, 2);

console.log("website-chat.test.ts ok");
