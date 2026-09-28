import assert from "node:assert/strict";
import { canSearchVendors, filterVendorNames, VENDOR_SEARCH_MIN } from "./vendor-search.ts";

assert.equal(VENDOR_SEARCH_MIN, 3);
assert.equal(canSearchVendors(""), false);
assert.equal(canSearchVendors("Br"), false);
assert.equal(canSearchVendors("   Br   "), false);
assert.equal(canSearchVendors("Bra"), true);
assert.equal(canSearchVendors("  Bra  "), true);
assert.equal(canSearchVendors("Bran"), true);

const vendors = [
  { name: "Brandy Melville Dallas" },
  { name: "Breeze Air Wash" },
  { name: "Home Depot" },
];

assert.deepEqual(filterVendorNames(vendors, "B"), []);
assert.deepEqual(filterVendorNames(vendors, "Br"), []);
assert.deepEqual(
  filterVendorNames(vendors, "Bra").map((item) => item.name),
  ["Brandy Melville Dallas"],
);
assert.deepEqual(
  filterVendorNames(vendors, "breeze").map((item) => item.name),
  ["Breeze Air Wash"],
);

console.log("vendor-search.test.ts ok");
