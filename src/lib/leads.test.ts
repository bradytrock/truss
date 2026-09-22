import assert from "node:assert/strict";
import {
  DEFAULT_LEAD_STATE,
  formatJobSite,
  leadNeedsReferrer,
  leadStateOrDefault,
  matchReferralPartners,
  referralPartners,
} from "./leads.ts";

assert.equal(DEFAULT_LEAD_STATE, "TX");
assert.equal(leadStateOrDefault(""), "TX");
assert.equal(leadStateOrDefault("   "), "TX");
assert.equal(leadStateOrDefault(undefined), "TX");
assert.equal(leadStateOrDefault("OK"), "OK");
assert.equal(leadStateOrDefault(" ok "), "ok");
assert.equal(
  formatJobSite({ street: "100 Main", city: "Plano", state: leadStateOrDefault(""), postalCode: "75074" }),
  "100 Main, Plano, TX 75074",
);

assert.equal(leadNeedsReferrer("realtor"), true);
assert.equal(leadNeedsReferrer("referral"), true);
assert.equal(leadNeedsReferrer("website"), false);

const book = [
  { id: "h1", name: "Dana Alvarez", title: "Homeowner", email: "", phone: "", isReferralPartner: false },
  { id: "p2", name: "Kate Quinn", title: "Realtor", email: "kate@broker.com", phone: "(972) 555-0102", isReferralPartner: true },
  { id: "p1", name: "Brook Ellis", title: "Realtor", email: "brook@broker.com", phone: "(214) 555-0199", isReferralPartner: true },
];
assert.deepEqual(
  referralPartners(book).map((contact) => contact.name),
  ["Brook Ellis", "Kate Quinn"],
);
assert.deepEqual(
  matchReferralPartners(book, "kate").map((contact) => contact.id),
  ["p2"],
);
assert.equal(matchReferralPartners(book, "").length, 2);

console.log("leads.test.ts ok");
