import assert from "node:assert/strict";
import { buildRfc822, formatMailboxAddress, senderDisplayName, usableSenderName } from "./gmail-address.ts";

const email = "bjones@trockroofer.com";

assert.equal(formatMailboxAddress("Brady Jones", email), `"Brady Jones" <${email}>`);
assert.equal(formatMailboxAddress("", email), email);
assert.equal(formatMailboxAddress('Ann "Ace" Jones', email), `"Ann \\"Ace\\" Jones" <${email}>`);
assert.equal(
  formatMailboxAddress("José", email),
  `=?UTF-8?B?${Buffer.from("José", "utf8").toString("base64")}?= <${email}>`,
);
assert.equal(formatMailboxAddress("Brady\r\nBcc: evil@example.com", email), `"Brady Bcc: evil@example.com" <${email}>`);

assert.equal(usableSenderName("bjones", email), "");
assert.equal(usableSenderName(email, email), "");
assert.equal(usableSenderName("Brady Jones", email), "Brady Jones");

assert.equal(senderDisplayName({ staffName: "Brady Jones", sendAsName: "", email }), "Brady Jones");
assert.equal(
  senderDisplayName({ staffName: "bjones", sendAsName: "Brady Jones", email }),
  "Brady Jones",
);
assert.equal(senderDisplayName({ staffName: "", sendAsName: "Brady Jones", email }), "Brady Jones");
assert.equal(senderDisplayName({ staffName: "bjones", sendAsName: "bjones", email }), "");

const raw = buildRfc822({
  from: email,
  fromName: "Brady Jones",
  to: "homeowner@example.com",
  subject: "Test Email",
  body: "Hello",
});
assert.match(raw, /^From: "Brady Jones" <bjones@trockroofer.com>\r\n/);
assert.match(raw, /To: homeowner@example.com\r\n/);
assert.doesNotMatch(raw, /^From: bjones@/m);

const bare = buildRfc822({
  from: email,
  to: "homeowner@example.com",
  subject: "Test Email",
  body: "Hello",
});
assert.match(bare, /^From: bjones@trockroofer.com\r\n/);
