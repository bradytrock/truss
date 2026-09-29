import assert from "node:assert/strict";
import {
  estimateOpenedActivityBody,
  estimateOpenedEmailSubject,
  estimateOpenedEmailText,
  estimateOpenedSms,
  isLinkPreviewBot,
  parseEstimateOpenedNotify,
} from "./estimate-opened.ts";

assert.equal(isLinkPreviewBot("facebookexternalhit/1.1 Facebot Twitterbot/1.0"), true);
assert.equal(isLinkPreviewBot("Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Applebot/0.1"), true);
assert.equal(isLinkPreviewBot("Slackbot-LinkExpanding 1.0"), true);
assert.equal(
  isLinkPreviewBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"),
  false,
);

assert.equal(
  estimateOpenedActivityBody({ contactName: "Jenn Whitby", estimateNumber: "EST-1042" }),
  "Jenn Whitby opened proposal EST-1042.",
);
assert.equal(estimateOpenedActivityBody({ estimateName: "Roof replacement" }), "The homeowner opened proposal Roof replacement.");

const notify = {
  name: "Alex Rivera",
  phone: "2145550101",
  email: "alex@example.com",
  estimateNumber: "EST-1042",
  estimateName: "Roof replacement",
  jobCode: "AR-1042",
  address: "4418 E 32nd Ave, Denver, CO 80205",
  contactName: "Jenn Whitby",
  companyName: "T-Rock Roofing",
  companyEmail: "office@example.com",
};

assert.equal(
  estimateOpenedSms(notify),
  "Jenn Whitby opened proposal EST-1042 (AR-1042 · 4418 E 32nd Ave, Denver, CO 80205).",
);
assert.equal(
  estimateOpenedEmailSubject(notify),
  "Proposal EST-1042 opened — 4418 E 32nd Ave, Denver, CO 80205",
);
assert.match(estimateOpenedEmailText(notify), /Job: AR-1042/);

assert.equal(parseEstimateOpenedNotify(null), null);
assert.equal(parseEstimateOpenedNotify({ notify: { name: "", phone: "", email: "" } }), null);
const parsed = parseEstimateOpenedNotify({
  ok: true,
  notify: { name: "Alex Rivera", phone: "2145550101", email: "alex@example.com", address: "100 Main" },
});
assert.equal(parsed?.name, "Alex Rivera");
assert.equal(parsed?.address, "100 Main");

console.log("estimate-opened.test.ts ok");
