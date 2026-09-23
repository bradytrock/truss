import assert from "node:assert/strict";
import {
  addItemsLabel,
  catalogItemsMatchingQuery,
  nextLineSortOrders,
  selectedCatalogItems,
  toggleSelectedId,
} from "./catalog-pick.ts";

assert.deepEqual(toggleSelectedId([], "a"), ["a"]);
assert.deepEqual(toggleSelectedId(["a"], "b"), ["a", "b"]);
assert.deepEqual(toggleSelectedId(["a", "b"], "a"), ["b"]);

const catalog = [
  { id: "tear", name: "Tear-off" },
  { id: "under", name: "Underlayment" },
  { id: "shingle", name: "Shingles" },
];
assert.deepEqual(
  selectedCatalogItems(catalog, ["shingle", "missing", "tear"]).map((item) => item.name),
  ["Shingles", "Tear-off"],
);
assert.deepEqual(selectedCatalogItems(catalog, []), []);

assert.deepEqual(nextLineSortOrders(0, 3), [1, 2, 3]);
assert.deepEqual(nextLineSortOrders(4, 2), [5, 6]);
assert.deepEqual(nextLineSortOrders(-2, 1), [1]);
assert.deepEqual(nextLineSortOrders(8, 0), []);

assert.equal(addItemsLabel(0), "Add items");
assert.equal(addItemsLabel(1), "Add 1 item");
assert.equal(addItemsLabel(4), "Add 4 items");

const book = [
  { id: "1", name: "Tear-off", costCode: "TO-01", description: "Remove existing shingles" },
  { id: "2", name: "Synthetic underlayment", costCode: "UL-10", description: "" },
  { id: "3", name: "Architectural shingles", costCode: "SH-25", description: "30-year" },
];
assert.deepEqual(
  catalogItemsMatchingQuery(book, "tear").map((item) => item.id),
  ["1"],
);
assert.deepEqual(
  catalogItemsMatchingQuery(book, "ul-10").map((item) => item.id),
  ["2"],
);
assert.equal(catalogItemsMatchingQuery(book, "", 2).length, 2);
assert.equal(catalogItemsMatchingQuery(book, "nope").length, 0);

console.log("catalog-pick.test.ts ok");
