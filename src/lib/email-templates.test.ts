import assert from "node:assert/strict";
import {
  clearEmailTemplate,
  emailTemplateFieldValue,
  emailTemplateHasOverride,
  parseEmailTemplates,
  resolveSystemEmail,
  systemEmailText,
  updateEmailTemplateDraft,
} from "./email-templates.ts";

const stored = parseEmailTemplates({
  estimate: { headline: "Hi {{name}}, {{company}} sent your estimate." },
  ignored: { subject: "nope" },
  invite: { subject: "   " },
});

assert.equal(stored.estimate?.headline, "Hi {{name}}, {{company}} sent your estimate.");
assert.equal(stored.invite, undefined);
assert.equal(emailTemplateHasOverride(stored, "estimate"), true);
assert.equal(emailTemplateHasOverride(stored, "invoice"), false);

const resolved = resolveSystemEmail("estimate", stored, {
  name: "Dana",
  company: "T Rock Roofing",
  addressClause: " for 100 Main St",
  managerLine: "",
});
assert.equal(resolved.headline, "Hi Dana, T Rock Roofing sent your estimate.");
assert.equal(resolved.subject, "Your Proposal from T Rock Roofing for 100 Main St");
assert.equal(resolved.button, "Review & sign");
assert.match(resolved.message, /Take a look/);

const defaults = resolveSystemEmail("estimate", {}, {
  name: "Dana",
  company: "T Rock Roofing",
  addressClause: "",
  managerLine: "Alex put this together after walking your roof. ",
});
assert.equal(defaults.headline, "Hi Dana, your estimate from T Rock Roofing is ready.");
assert.equal(defaults.subject, "Your Proposal from T Rock Roofing");
assert.match(defaults.message, /^Alex put this together/);

assert.equal(
  emailTemplateFieldValue(stored, "estimate", "button"),
  "Review & sign",
);
const edited = updateEmailTemplateDraft(stored, "invoice", "button", "Open invoice");
assert.equal(edited.invoice?.button, "Open invoice");
const reset = updateEmailTemplateDraft(edited, "invoice", "button", "View invoice");
assert.equal(reset.invoice, undefined);
assert.deepEqual(clearEmailTemplate(stored, "estimate"), {});
assert.equal(
  systemEmailText({ headline: "Hi Dana,", message: "Your estimate is ready.", url: "https://example.com/e" }),
  "Hi Dana,\n\nYour estimate is ready.\n\nhttps://example.com/e",
);
assert.equal(systemEmailText({ message: "Details only." }), "Details only.");

console.log("email-templates.test.ts ok");
