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
  officeWebsiteChats,
  parseChatPhone,
  parseChatState,
  parseChatStreet,
  parseChatTrades,
  parseChatZip,
  parseSuggestedReplies,
  textHandoffBody,
  websiteChatAdminSubject,
  websiteChatAdminText,
  websiteChatEmbedCode,
  websiteChatNotifyAdmins,
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
  ownerName: "Jordan Hale",
  trades: "Roofing",
}), /Jordan Hale's pipeline/);
assert.match(websiteChatAdminText({
  name: "Brady Jones",
  phone: "(469) 555-0100",
  street: "123 Oak Street",
  companyName: "T Rock Roofing",
  trades: "Roofing",
}), /Trades: Roofing/);
assert.equal(
  websiteChatEmbedCode("https://crmtrock.com", "t-rock", "11111111-1111-4111-8111-111111111111"),
  '<script src="https://crmtrock.com/api/chat/widget.js" data-company="t-rock" data-person="11111111-1111-4111-8111-111111111111" async></script>',
);
assert.equal(
  websiteChatEmbedCode("https://crmtrock.com/", "t-rock"),
  '<script src="https://crmtrock.com/api/chat/widget.js" data-company="t-rock" async></script>',
);

const officeAdmins = [
  { name: "Jordan Hale", email: "jordan@example.com" },
  { name: "Ada Lovelace", email: "ada@example.com" },
];
assert.deepEqual(websiteChatNotifyAdmins(officeAdmins), officeAdmins);
assert.deepEqual(websiteChatNotifyAdmins(officeAdmins, "Ada Lovelace"), [
  { name: "Ada Lovelace", email: "ada@example.com" },
]);
assert.deepEqual(websiteChatNotifyAdmins(officeAdmins, "  ada lovelace "), [
  { name: "Ada Lovelace", email: "ada@example.com" },
]);
assert.deepEqual(websiteChatNotifyAdmins(officeAdmins, "Someone Else"), []);

const officeChats = officeWebsiteChats([
  {
    id: "chat-1",
    label: null,
    updatedAt: null,
    preview: null,
    messages: [{ id: "m1", direction: "inbound", body: null, createdAt: null }, { id: "" }, null],
  },
  { label: "Missing id" },
  null,
]);
assert.equal(officeChats.length, 1);
assert.equal(officeChats[0].label, "Website visitor");
assert.equal(officeChats[0].updatedAt, "");
assert.equal(officeChats[0].preview, "");
assert.equal(officeChats[0].messages.length, 1);
assert.equal(officeChats[0].messages[0].body, "");
assert.deepEqual(officeWebsiteChats({ chats: [] }), []);

console.log("website-chat.test.ts ok");
