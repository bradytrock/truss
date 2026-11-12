import assert from "node:assert/strict";
import {
  addressChoiceLabel,
  applyAddress,
  bookAddressesMatching,
  cassioSubtitle,
  countWord,
  damageLabel,
  leadDoneLine,
  leadIntro,
  leadNextSteps,
  leadPreview,
  mergeAddressChoices,
  plannedLeadLine,
  preferredAddressId,
} from "./preview.ts";
import type { AssistantToolCall } from "./types.ts";

const call: AssistantToolCall = {
  id: "call-1",
  name: "create_lead",
  arguments: {
    firstName: "Jane",
    lastName: "Ortiz",
    phone: "214-555-0144",
    street: "412 Maple",
    source: "website",
    notes: "Hail roof",
  },
};

const preview = leadPreview(call, {
  ownerName: "Blake Jones",
  codes: [],
  contacts: [],
  now: new Date(2026, 10, 10),
});

assert.equal(preview.fullName, "Jane Ortiz");
assert.equal(preview.phone, "(214) 555-0144");
assert.equal(preview.damage, "Hail · Roof");
assert.equal(preview.sourceLabel, "Website");
assert.equal(preview.contactNote, "new contact");
assert.equal(preview.assignedTo, "You");
assert.equal(preview.jobCode, "BJ111026-A");
assert.equal(preview.fields.find((field) => field.label === "Contact")?.value, "Jane Ortiz · new contact");
assert.equal(preview.fields.find((field) => field.label === "LLC"), undefined);

const llcCall: AssistantToolCall = {
  ...call,
  arguments: {
    ...call.arguments,
    llcName: "Maple Street Holdings LLC",
    relatedContactName: "Riley Chen",
    relatedContactTitle: "Property manager",
  },
};
const llcPreview = leadPreview(llcCall, {
  ownerName: "Blake Jones",
  codes: [],
  contacts: [],
  now: new Date(2026, 10, 10),
});
assert.equal(llcPreview.fields.find((field) => field.label === "LLC")?.value, "Maple Street Holdings LLC");
assert.equal(
  llcPreview.fields.find((field) => field.label === "Related contact")?.value,
  "Riley Chen · Property manager",
);
assert.equal(cassioSubtitle(), "Runs your book: leads, estimates, invoices, mail");
assert.equal(cassioSubtitle("Jane Ortiz"), "New lead · Jane Ortiz");
assert.equal(leadIntro(1, "412 Maple"), "Here's the lead I'll create.");
assert.equal(
  leadIntro(2, "412 Maple St"),
  "Here's the lead I'll create. One thing to check first: there are two 412 Maples in your area.",
);
assert.equal(countWord(3), "three");
assert.equal(damageLabel("wind damage on the roof"), "Wind · Roof");
assert.equal(plannedLeadLine("412 Maple St, Flower Mound 75028", true), "Planned a new lead · 412 Maple St, Flower Mound 75028 picked");
assert.match(leadDoneLine("Jane"), /^Done\. Jane is in your book/);

const book = bookAddressesMatching(
  [
    { id: "1", street: "412 Maple St", city: "Flower Mound", state: "TX", postalCode: "75028" },
    { id: "2", street: "412 Maple Ave", city: "Lewisville", state: "TX", postalCode: "75057" },
    { id: "3", street: "900 Oak St", city: "Dallas", state: "TX", postalCode: "75201", deletedAt: "2026-01-01" },
  ],
  "412 Maple",
);
assert.equal(book.length, 2);
assert.equal(addressChoiceLabel(book[0]), "412 Maple St, Flower Mound 75028");

const merged = mergeAddressChoices(book, [
  { id: "remote", label: "", street: "412 Maple St", city: "Flower Mound", state: "TX", postalCode: "75028" },
  { id: "remote-2", label: "", street: "412 Maple Dr", city: "Highland Village", state: "TX", postalCode: "75077" },
]);
assert.equal(merged.length, 3);
assert.equal(preferredAddressId(merged, { street: "412 Maple Ave", city: "Lewisville", postalCode: "75057" }), "book:2");

const applied = applyAddress(call, merged[1]);
assert.equal(applied.arguments.street, "412 Maple Ave");
assert.equal(applied.arguments.postalCode, "75057");

const steps = leadNextSteps({ firstName: "Jane", address: "412 Maple St, Flower Mound 75028", code: "BJ111026-A" });
assert.equal(steps[0]?.label, "Schedule a roof inspection");
assert.match(steps[1]?.prompt ?? "", /Text Jane/);
assert.match(steps[2]?.prompt ?? "", /BJ111026-A/);

const known = leadPreview(call, {
  ownerName: "Blake Jones",
  codes: [],
  contacts: [{ name: "Jane Ortiz", phone: "(214) 555-0144" }],
  now: new Date(2026, 10, 10),
});
assert.equal(known.contactNote, "in your book");

console.log("preview.test.ts ok");
