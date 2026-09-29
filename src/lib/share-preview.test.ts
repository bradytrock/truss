import assert from "node:assert/strict";
import { PRODUCT_NAME } from "./product.ts";
import { estimateSharePreview, estimateSharePreviewTitle, sharePreviewCompanyName } from "./share-preview.ts";

assert.equal(estimateSharePreviewTitle("T-Rock Roofing"), "Your Estimate from T-Rock Roofing");
assert.equal(estimateSharePreviewTitle("  Northline  "), "Your Estimate from Northline");
assert.equal(estimateSharePreviewTitle("Acme\nRoofing"), "Your Estimate from Acme Roofing");
assert.equal(estimateSharePreviewTitle(""), "Your Estimate");
assert.equal(estimateSharePreviewTitle("   "), "Your Estimate");
assert.equal(estimateSharePreviewTitle(null), "Your Estimate");
assert.equal(estimateSharePreviewTitle("Contractor"), "Your Estimate");
assert.equal(estimateSharePreviewTitle("Your contractor"), "Your Estimate");

assert.equal(sharePreviewCompanyName("T-Rock Roofing"), "T-Rock Roofing");
assert.equal(sharePreviewCompanyName("Your contractor"), "");

const summit = estimateSharePreview({
  companyName: "Summit Roofing",
  street: "4418 E 32nd Ave",
  city: "Denver",
  state: "CO",
  postalCode: "80205",
});
assert.equal(summit.title, "Your Estimate from Summit Roofing");
assert.equal(summit.description, "4418 E 32nd Ave, Denver, CO 80205");
assert.equal(summit.siteName, "Summit Roofing");
assert.equal(summit.title.includes(PRODUCT_NAME), false);
assert.equal(summit.description.includes(PRODUCT_NAME), false);

const streetOnly = estimateSharePreview({
  companyName: "Summit Roofing",
  street: "100 Main St",
});
assert.equal(streetOnly.title, "Your Estimate from Summit Roofing");
assert.equal(streetOnly.description, "100 Main St");

const noAddress = estimateSharePreview({
  companyName: "Summit Roofing",
});
assert.equal(noAddress.title, "Your Estimate from Summit Roofing");
assert.equal(noAddress.description, "Review and sign your estimate.");

const placeholder = estimateSharePreview({
  companyName: "Your contractor",
  street: "100 Main St",
});
assert.equal(placeholder.title, "Your Estimate");
assert.equal(placeholder.siteName, "");
assert.equal(placeholder.description, "100 Main St");

console.log("share-preview.test.ts ok");
