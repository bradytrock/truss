import assert from "node:assert/strict";
import {
  paperAuthorizationCopy,
  paperCompanyLines,
  paperEstimateMeta,
  paperFooterLeft,
  paperInvoiceMeta,
  paperIssuedAt,
  paperKindLabel,
  paperMetaBlank,
  paperQtyLabel,
  paperRescissionCopy,
  paperSiteTitle,
  paperSplitColumns,
  paperTermsColumns,
} from "./document-paper.ts";

assert.equal(paperKindLabel("estimate"), "ESTIMATE");
assert.equal(paperKindLabel("invoice"), "INVOICE");

const site = paperSiteTitle({
  street: "9174 Shadowridge Drive",
  city: "Highland Village",
  state: "TX",
  postalCode: "75077",
  name: "Shadowridge",
});
assert.equal(site.title, "9174 Shadowridge Drive");
assert.equal(site.locality, "Highland Village, TX 75077");

assert.equal(paperSiteTitle({ name: "Roof replace", kindTitle: "Estimate" }).title, "Roof replace");
assert.equal(paperSiteTitle({ kindTitle: "Invoice" }).title, "Invoice");

assert.equal(paperMetaBlank(""), "—");
assert.equal(paperMetaBlank("  EST-1  "), "EST-1");
assert.equal(paperIssuedAt({ sentAt: "2026-09-20", createdAt: "2026-09-14" }), "2026-09-20");
assert.equal(paperIssuedAt({ sentAt: null, createdAt: "2026-09-14" }), "2026-09-14");
assert.equal(paperQtyLabel(1), "1");
assert.equal(paperQtyLabel(38.5), "38.5");

const company = paperCompanyLines({
  name: "T Rock Roofing",
  street: "1 Main",
  city: "Dallas",
  state: "TX",
  postalCode: "75000",
  phone: "2145550100",
  email: "office@example.com",
  website: "trock.com",
  licenseNumber: "TACL123",
});
assert.equal(company.name, "T Rock Roofing");
assert.ok(company.address.some((line) => line.includes("1 Main")));
assert.match(company.contact, /214/);
assert.match(company.contact, /office@example.com/);
assert.deepEqual(company.contactLines.slice(0, 2).map((line) => line.includes("214") || line.includes("office@example.com")), [true, true]);
assert.equal(company.license, "License TACL123");

assert.match(paperFooterLeft({ name: "T Rock Roofing", phone: "2145550100", email: "office@example.com" }), /T Rock Roofing/);
assert.match(paperAuthorizationCopy("T Rock Roofing"), /T Rock Roofing/);
assert.match(paperRescissionCopy(), /third business day/i);

const estimateMeta = paperEstimateMeta({
  number: "EST-FORMAT",
  issuedAt: "2026-09-14",
  validUntil: "2026-10-14",
  jobCode: "JH091426-A",
});
assert.equal(estimateMeta[0]?.label, "Estimate no.");
assert.equal(estimateMeta[0]?.value, "EST-FORMAT");
assert.equal(estimateMeta[3]?.value, "JH091426-A");

const invoiceMeta = paperInvoiceMeta({
  number: "INV-FORMAT",
  issuedAt: "2026-09-14",
  dueAt: "2026-10-14",
});
assert.equal(invoiceMeta[0]?.label, "Invoice no.");
assert.equal(invoiceMeta[3]?.value, "—");

const [left, right] = paperSplitColumns([1, 2, 3, 4, 5]);
assert.deepEqual(left, [1, 2, 3]);
assert.deepEqual(right, [4, 5]);

const [termLeft, termRight] = paperTermsColumns(
  "1. First\nOne.\n\n2. Second\nTwo.\n\n3. Third\nThree.",
);
assert.equal(termLeft.length, 2);
assert.equal(termRight.length, 1);

console.log("document-paper tests passed");
