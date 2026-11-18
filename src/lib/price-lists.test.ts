import assert from "node:assert/strict";
import {
  catalogForOrder,
  currentCatalog,
  currentPriceList,
  isCurrentPriceList,
  listsReplacedByNewBook,
  orderSupplyLists,
  orderUsesCompanyBook,
  priceListSupplierKey,
} from "./price-lists.ts";
import type { CatalogItem, PriceList } from "./types.ts";

function list(partial: Partial<PriceList> & Pick<PriceList, "id" | "vendor">): PriceList {
  return {
    name: partial.id,
    effectiveOn: "2026-01-01",
    outdatedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function item(partial: Partial<CatalogItem> & Pick<CatalogItem, "id" | "priceListId">): CatalogItem {
  return {
    name: partial.id,
    description: "",
    kind: "material",
    unit: "ea",
    unitCost: 1,
    marginPercent: 0,
    costCode: "",
    ...partial,
  };
}

const abcCurrent = list({
  id: "abc-new",
  vendor: "ABC Supply",
  name: "April",
  effectiveOn: "2026-04-01",
  createdAt: "2026-04-01T00:00:00.000Z",
});
const abcOld = list({
  id: "abc-old",
  vendor: "ABC Supply",
  name: "January",
  effectiveOn: "2026-01-01",
  outdatedAt: "2026-04-01T00:00:00.000Z",
});
const beacon = list({
  id: "beacon",
  vendor: "Beacon Roofing Supply",
  name: "March",
  effectiveOn: "2026-03-01",
  createdAt: "2026-03-01T00:00:00.000Z",
});
const company = list({
  id: "company",
  vendor: "",
  name: "Office",
  effectiveOn: "2026-02-01",
  createdAt: "2026-02-01T00:00:00.000Z",
});
const lists = [abcOld, company, beacon, abcCurrent];
const catalog = [
  item({ id: "abc-shingle", priceListId: "abc-new", name: "ABC shingle" }),
  item({ id: "abc-old-shingle", priceListId: "abc-old", name: "ABC old shingle" }),
  item({ id: "beacon-shingle", priceListId: "beacon", name: "Beacon shingle" }),
  item({ id: "company-nail", priceListId: "company", name: "Office nail" }),
];

assert.equal(priceListSupplierKey("  ABC   Supply "), "abc supply");
assert.equal(currentPriceList(lists)?.id, "abc-new");
assert.equal(isCurrentPriceList(abcCurrent, lists), true);
assert.equal(isCurrentPriceList(beacon, lists), true);
assert.equal(isCurrentPriceList(company, lists), true);
assert.equal(isCurrentPriceList(abcOld, lists), false);

assert.deepEqual(
  listsReplacedByNewBook(lists, "abc supply").map((entry) => entry.id),
  ["abc-new"],
);
assert.deepEqual(listsReplacedByNewBook(lists, "SRS").map((entry) => entry.id), []);

assert.deepEqual(
  orderSupplyLists(lists, "Beacon Roofing Supply").map((entry) => entry.id),
  ["beacon"],
);
assert.deepEqual(
  orderSupplyLists(lists, "ABC Supply").map((entry) => entry.id),
  ["abc-new", "abc-old"],
);
assert.deepEqual(orderSupplyLists(lists, "SRS").map((entry) => entry.id), ["company"]);
assert.deepEqual(orderSupplyLists(lists, ""), []);
assert.equal(orderUsesCompanyBook(lists, "SRS"), true);
assert.equal(orderUsesCompanyBook(lists, "ABC Supply"), false);
assert.equal(orderUsesCompanyBook(lists, ""), false);

assert.deepEqual(
  currentCatalog(catalog, lists).map((entry) => entry.id).sort(),
  ["abc-shingle", "beacon-shingle", "company-nail"],
);
assert.deepEqual(
  catalogForOrder(catalog, lists, "ABC Supply").map((entry) => entry.id),
  ["abc-shingle"],
);
assert.deepEqual(
  catalogForOrder(catalog, lists, "ABC Supply", "abc-old").map((entry) => entry.id),
  ["abc-old-shingle"],
);
assert.deepEqual(
  catalogForOrder(catalog, lists, "SRS").map((entry) => entry.id),
  ["company-nail"],
);
assert.deepEqual(catalogForOrder(catalog, lists, ""), []);
assert.deepEqual(
  catalogForOrder(catalog, [abcOld], "ABC Supply").map((entry) => entry.id),
  ["abc-old-shingle"],
);
assert.deepEqual(
  catalogForOrder(catalog, lists, "ABC Supply", "beacon").map((entry) => entry.id),
  ["abc-shingle"],
);

const withUnassigned = [
  ...catalog,
  item({ id: "loose", priceListId: null, name: "Loose nail" }),
];
assert.deepEqual(
  currentCatalog(withUnassigned, lists).map((entry) => entry.id).sort(),
  ["abc-shingle", "beacon-shingle", "company-nail", "loose"],
);
assert.deepEqual(
  catalogForOrder(withUnassigned, lists, "ABC Supply").map((entry) => entry.id),
  ["abc-shingle"],
);
assert.deepEqual(
  catalogForOrder(withUnassigned, lists, "SRS").map((entry) => entry.id).sort(),
  ["company-nail", "loose"],
);
