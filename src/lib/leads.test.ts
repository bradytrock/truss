import assert from "node:assert/strict";
import {
  DEFAULT_LEAD_STATE,
  companyNameKey,
  formatJobSite,
  leadContactTitle,
  leadCustomerHint,
  leadExtraIssue,
  leadExtrasToSave,
  leadIntakeIssue,
  leadNeedsReferrer,
  leadPersonName,
  leadRecordName,
  leadReferrerAllowsFreeText,
  leadStateOrDefault,
  matchReferralPartners,
  matchingCompany,
  referralPartners,
  relatedContactTitle,
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

const homeowner = {
  kind: "homeowner" as const,
  firstName: "Riley",
  lastName: "",
  businessName: "",
  contactName: "",
  phone: "(214) 555-0100",
  street: "100 Main",
  source: "door_knock",
};
assert.equal(leadIntakeIssue(homeowner), null);
assert.equal(leadIntakeIssue({ ...homeowner, firstName: "  " }), "First name is required.");
assert.equal(leadIntakeIssue({ ...homeowner, phone: "" }), "A phone number is required.");
assert.equal(leadIntakeIssue({ ...homeowner, street: "" }), "Property address is required.");
assert.equal(leadIntakeIssue({ ...homeowner, source: "" }), "Pick a lead source.");
assert.equal(leadPersonName(homeowner), "Riley");
assert.equal(
  leadRecordName({
    first: homeowner.firstName,
    last: homeowner.lastName,
    site: "100 Main, Plano, TX 75074",
    companyName: "",
  }),
  "Riley — 100 Main, Plano, TX 75074",
);
assert.equal(
  leadCustomerHint("homeowner"),
  "The homeowner signs, and proposals and invoices go to them.",
);

const business = {
  kind: "business" as const,
  firstName: "",
  lastName: "",
  businessName: "Maple Street Holdings LLC",
  contactName: "Riley Chen",
  phone: "(214) 555-0199",
  street: "100 Main",
  source: "referral",
};
assert.equal(leadIntakeIssue(business), null);
assert.equal(leadIntakeIssue({ ...business, businessName: "" }), "LLC or business name is required.");
assert.equal(leadIntakeIssue({ ...business, contactName: " " }), "Name the person you'll call.");
assert.equal(leadPersonName(business), "Riley Chen");
assert.equal(
  leadRecordName({
    first: "",
    last: "",
    site: "100 Main",
    companyName: business.businessName,
  }),
  "Maple Street Holdings LLC — 100 Main",
);
assert.match(leadCustomerHint("business"), /The LLC signs/);

assert.equal(leadExtraIssue([{ name: "", phone: "", email: "" }]), null);
assert.equal(leadExtraIssue([{ name: "", phone: "(214) 555-0101" }]), "Name each additional contact.");
assert.equal(leadExtraIssue([{ name: "", started: true }]), "Name each additional contact.");
assert.deepEqual(leadExtrasToSave([{ name: "  " }, { name: " Sam Ortiz ", phone: " 214 " }]), [
  { name: "Sam Ortiz", phone: "214", email: "" },
]);

assert.equal(
  leadRecordName({ first: "Jane", last: "Ortiz", site: "100 Main, Plano, TX", companyName: "" }),
  "Ortiz — 100 Main, Plano, TX",
);
assert.equal(
  leadRecordName({
    first: "Jane",
    last: "Ortiz",
    site: "100 Main, Plano, TX",
    companyName: " Maple Street Holdings LLC ",
  }),
  "Maple Street Holdings LLC — 100 Main, Plano, TX",
);
assert.equal(leadRecordName({ first: "Jane", last: "Ortiz", site: "", companyName: "Maple LLC" }), "Maple LLC");
assert.equal(leadContactTitle(""), "Homeowner");
assert.equal(leadContactTitle("Maple LLC"), "Owner");
assert.equal(companyNameKey(" Maple Street Holdings, LLC "), "maple street holdings llc");
assert.equal(
  matchingCompany(
    [
      { id: "c1", name: "Maple Street Holdings, LLC" },
      { id: "c2", name: "Other Co" },
    ],
    "maple street holdings llc",
  )?.id,
  "c1",
);
assert.equal(matchingCompany([{ id: "c1", name: "Maple LLC" }], "   "), undefined);
assert.equal(relatedContactTitle("tenant"), "Tenant");
assert.equal(relatedContactTitle("other", "  Facilities "), "Facilities");
assert.equal(relatedContactTitle("other", " "), "Property manager");
assert.equal(relatedContactTitle("nope"), "Property manager");

console.log("leads.test.ts ok");
