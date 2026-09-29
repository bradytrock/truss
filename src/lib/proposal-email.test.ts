import assert from "node:assert/strict";
import { renderProposalEmailHtml, renderProposalEmailText } from "./proposal-email.ts";

const input = {
  company: "T Rock Roofing",
  customer: "Dana Alvarez",
  number: "E-1042",
  name: "100 Main St",
  url: "https://app.example.com/e/token",
  street: "100 Main St",
  city: "Plano",
  state: "TX",
  postalCode: "75074",
  validUntil: "2026-10-15",
};

const html = renderProposalEmailHtml(input);
const text = renderProposalEmailText(input);

assert.match(html, /Hi Dana, your estimate from T Rock Roofing is&nbsp;ready\./);
assert.doesNotMatch(html, /your roof proposal is/);
assert.match(html, /Job address/);
assert.match(html, /100 Main St/);
assert.match(html, /Valid through/);
assert.match(html, /Review &amp; sign/);
assert.doesNotMatch(html, /Takes about two minutes\. No account or app required\./);
assert.match(html, /https:\/\/app\.example\.com\/e\/token/);
assert.doesNotMatch(html, />Scope</);
assert.doesNotMatch(html, /Restoration/);
assert.doesNotMatch(html, /\$/);

assert.match(text, /Hi Dana, your estimate from T Rock Roofing is ready\./);
assert.doesNotMatch(text, /your roof proposal is/);
assert.match(text, /Job address/);
assert.match(text, /100 Main St/);
assert.match(text, /Valid through/);
assert.match(text, /Review & sign:/);
assert.match(text, /https:\/\/app\.example\.com\/e\/token/);
assert.doesNotMatch(text, /^Scope$/m);
assert.doesNotMatch(text, /Restoration/);
assert.doesNotMatch(text, /\$/);

console.log("proposal-email.test.ts ok");
