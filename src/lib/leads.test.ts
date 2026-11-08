import assert from "node:assert/strict";
import {
  DEFAULT_LEAD_STATE,
  formatJobSite,
  leadNeedsReferrer,
  leadReferrerAllowsFreeText,
  leadStateOrDefault,
  matchReferralPartners,
  referralPartners,
  resolveLeadReferrer,
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
assert.equal(leadReferrerAllowsFreeText("referral"), true);
assert.equal(leadReferrerAllowsFreeText("realtor"), false);

assert.deepEqual(resolveLeadReferrer({ source: "referral", text: "  HOA board " }), {
  contactId: null,
  name: "HOA board",
});
assert.deepEqual(
  resolveLeadReferrer({
    source: "referral",
    contactId: "p1",
    contactName: "Brook Ellis",
    text: "Brook",
  }),
  { contactId: "p1", name: "Brook Ellis" },
);
assert.equal("error" in resolveLeadReferrer({ source: "referral", text: "   " }), true);
assert.equal("error" in resolveLeadReferrer({ source: "realtor", text: "Kate Quinn" }), true);
assert.deepEqual(
  resolveLeadReferrer({ source: "realtor", contactId: "p2", contactName: "Kate Quinn" }),
  { contactId: "p2", name: "Kate Quinn" },
);
assert.deepEqual(resolveLeadReferrer({ source: "website", text: "ignored" }), {
  contactId: null,
  name: "",
});

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
