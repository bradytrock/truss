import assert from "node:assert/strict";
import { catalogItemDescription, fillCatalogItem } from "./catalog-margin.ts";
import { fillEstimateLine, placeholderLineDescription } from "./estimate-totals.ts";

assert.equal(placeholderLineDescription("New item"), "");
assert.equal(placeholderLineDescription("new item"), "");
assert.equal(placeholderLineDescription("  New item  "), "");
assert.equal(placeholderLineDescription("Roofing System"), "Roofing System");
assert.equal(placeholderLineDescription(""), "");

assert.equal(catalogItemDescription({ description: "" }), "");
assert.equal(catalogItemDescription({ description: "  Tear-off to the deck  " }), "Tear-off to the deck");
assert.equal(catalogItemDescription({}), "");

const product = fillCatalogItem({
  id: "cat_1",
  name: "TAMKO Heritage",
  kind: "material",
  unit: "sq",
  unitCost: 100,
  costCode: "07",
});
assert.equal(product.description, "");

const custom = fillEstimateLine({
  id: "line_1",
  estimateId: "est_1",
  catalogItemId: null,
  title: "New item",
  description: "New item",
  quantity: 1,
  unit: "LS",
  unitCost: 0,
  sortOrder: 0,
});
assert.equal(custom.description, "");
assert.equal(custom.title, "New item");

const fromCatalog = fillEstimateLine({
  id: "line_2",
  estimateId: "est_1",
  catalogItemId: "cat_1",
  title: "TAMKO Heritage",
  description: catalogItemDescription({ description: "- Tear-off\n- Underlayment" }),
  quantity: 1,
  unit: "sq",
  unitCost: 100,
  sortOrder: 1,
});
assert.equal(fromCatalog.description, "- Tear-off\n- Underlayment");

console.log("catalog description tests passed");
