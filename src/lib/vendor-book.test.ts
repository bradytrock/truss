import assert from "node:assert/strict";
import type { QbVendor } from "./types.ts";
import { buildVendorBook, vendorAddressLine, visibleVendorRows } from "./vendor-book.ts";

function vendor(partial: Partial<QbVendor> & Pick<QbVendor, "id" | "name">): QbVendor {
  return {
    listId: partial.listId ?? partial.id,
    isActive: true,
    syncedAt: "2026-09-15T12:00:00.000Z",
    companyName: "",
    firstName: "",
    lastName: "",
    street: "",
    street2: "",
    city: "",
    state: "",
    postalCode: "",
    phone: "",
    altPhone: "",
    fax: "",
    email: "",
    contact: "",
    accountNumber: "",
    vendorType: "",
    terms: "",
    taxId: "",
    creditLimit: "",
    balance: "",
    notes: "",
    ...partial,
  };
}

assert.equal(
  vendorAddressLine({
    street: "914 S Main St",
    street2: "Ste 4",
    city: "Dallas",
    state: "TX",
    postalCode: "75201",
  }),
  "914 S Main St, Ste 4 · Dallas, TX · 75201",
);

const rows = buildVendorBook([
  vendor({
    id: "v2",
    name: "Zebra Waste",
    isActive: false,
    phone: "2145550100",
    vendorType: "Hauling",
  }),
  vendor({
    id: "v1",
    name: "ABC Supply",
    companyName: "ABC Supply Co",
    street: "100 Commerce",
    city: "Dallas",
    state: "TX",
    email: "ap@abc.com",
    isActive: true,
  }),
]);

assert.deepEqual(
  rows.map((row) => row.name),
  ["ABC Supply", "Zebra Waste"],
);
assert.equal(rows[0]?.statusLabel, "Active");
assert.equal(rows[0]?.kind, "quickbooks");
assert.equal(rows[0]?.nameKey, "abc supply");
assert.equal(rows[1]?.statusLabel, "Inactive");
assert.equal(rows[1]?.typeLine, "Hauling");
assert.equal(visibleVendorRows(rows, "zebra")[0]?.id, "v2");
assert.equal(visibleVendorRows(rows, "inactive").length, 0);
assert.equal(visibleVendorRows(rows, "dallas")[0]?.id, "v1");

console.log("vendor-book.test.ts ok");
