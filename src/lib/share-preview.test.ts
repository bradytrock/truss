import assert from "node:assert/strict";
import { estimateSharePreviewTitle, sharePreviewCompanyName } from "./share-preview.ts";

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

console.log("share-preview.test.ts ok");
