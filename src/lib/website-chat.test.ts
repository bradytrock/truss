import assert from "node:assert/strict";
import {
  fallbackChatReplies,
  isPhoneUserAgent,
  messagesAppLink,
  chatMarketLabel,
  chatProjectType,
  formatChatTrades,
  isChatEmailSkip,
  parseChatCity,
  parseChatEmail,
  parseChatMarket,
  parseChatName,
  parseChatPersonName,
  parseChatPhone,
  parseChatState,
  parseChatStreet,
  parseChatTrades,
  parseChatZip,
  parseSuggestedReplies,
  textHandoffBody,
  websiteChatAdminSubject,
  websiteChatAdminText,
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
assert.equal(parseChatName("  Brady Jones "), "Brady Jones");
assert.equal(parseChatName("1"), "");
assert.equal(parseChatPhone("(469) 555-0100"), "(469) 555-0100");
assert.equal(parseChatPhone("555"), "");
assert.equal(parseChatStreet("  123 Oak Street "), "123 Oak Street");
assert.equal(parseChatStreet("Oak"), "");
assert.equal(parseChatPersonName(" Mary Ann "), "Mary Ann");
assert.equal(parseChatPersonName("J"), "");
assert.equal(parseChatMarket("Residential"), "residential");
assert.equal(parseChatMarket("commercial"), "commercial");
assert.equal(parseChatMarket("house"), "residential");
assert.equal(parseChatMarket("nope"), "");
assert.equal(chatMarketLabel("commercial"), "Commercial");
assert.equal(parseChatTrades("gutters, Roofing"), "Roofing, Gutters");
assert.equal(parseChatTrades("plumbing"), "");
assert.equal(formatChatTrades(["Other", "Fencing"]), "Fencing, Other");
assert.equal(parseChatEmail(" John@Example.com "), "john@example.com");
assert.equal(parseChatEmail("nope"), "");
assert.equal(isChatEmailSkip("No email"), true);
assert.equal(parseChatCity(" Dallas "), "Dallas");
assert.equal(parseChatState("tx"), "TX");
assert.equal(parseChatState("Texas"), "TX");
assert.equal(parseChatState("T"), "");
assert.equal(parseChatZip("75201"), "75201");
assert.equal(parseChatZip("75201-1234"), "75201-1234");
assert.equal(parseChatZip("7520"), "");
assert.equal(chatProjectType("commercial", "Roofing"), "commercial");
assert.equal(chatProjectType("residential", "Roofing"), "roofing");
assert.equal(chatProjectType("residential", "Fencing, Gutters"), "exterior");
assert.equal(chatProjectType("residential", "Flooring"), "remodel");
assert.equal(chatProjectType("residential", "Other"), "restoration");
assert.equal(
  textHandoffBody("Brady Jones", "123 Oak Street"),
  "Hi, this is Brady Jones. I was on your website about 123 Oak Street.",
);
assert.equal(websiteChatAdminSubject("Brady Jones", "123 Oak Street"), "New website conversation — 123 Oak Street");
assert.match(websiteChatAdminText({
  name: "Brady Jones",
  phone: "(469) 555-0100",
  street: "123 Oak Street",
  companyName: "T Rock Roofing",
  email: "brady@example.com",
  city: "Dallas",
  state: "TX",
  postalCode: "75201",
  market: "Residential",
  trades: "Roofing, Gutters",
}), /unassigned/);
assert.match(websiteChatAdminText({
  name: "Brady Jones",
  phone: "(469) 555-0100",
  street: "123 Oak Street",
  companyName: "T Rock Roofing",
  trades: "Roofing",
}), /Trades: Roofing/);

console.log("website-chat.test.ts ok");
