import assert from "node:assert/strict";
import { canSearchVendors, filterVendorNames, VENDOR_SEARCH_MIN } from "./vendor-search.ts";

assert.equal(VENDOR_SEARCH_MIN, 4);
assert.equal(canSearchVendors(""), false);
assert.equal(canSearchVendors("Bra"), false);
assert.equal(canSearchVendors("   Bra   "), false);
assert.equal(canSearchVendors("Bran"), true);
assert.equal(canSearchVendors("  Bran  "), true);

const vendors = [
  { name: "Brandy Melville Dallas" },
  { name: "Breeze Air Wash" },
  { name: "Home Depot" },
];

assert.deepEqual(filterVendorNames(vendors, "B"), []);
assert.deepEqual(filterVendorNames(vendors, "Bra"), []);
assert.deepEqual(
  filterVendorNames(vendors, "Bran").map((item) => item.name),
  ["Brandy Melville Dallas"],
);
assert.deepEqual(
  filterVendorNames(vendors, "breeze").map((item) => item.name),
  ["Breeze Air Wash"],
);

console.log("vendor-search.test.ts ok");
