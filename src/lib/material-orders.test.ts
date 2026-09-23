import assert from "node:assert/strict";
import {
  materialOrderPropertySlug,
  nextMaterialOrderNumber,
  nextMaterialOrderSequence,
} from "./material-order-number.ts";

assert.equal(materialOrderPropertySlug("100 Main St, Plano, TX 75074"), "100-Main-St-Plano-TX-75074");
assert.equal(materialOrderPropertySlug(""), "Job");
assert.equal(materialOrderPropertySlug("1420 Oak Street, Dallas"), "1420-Oak-Street-Dallas");

assert.equal(nextMaterialOrderSequence([]), 1001);
assert.equal(nextMaterialOrderSequence(["MO-1044", "MO-100-Main-St-1048"]), 1049);

assert.equal(
  nextMaterialOrderNumber({ address: "100 Main St, Plano, TX 75074", existing: ["MO-1044"] }),
  "MO-100-Main-St-Plano-TX-75074-1045",
);
assert.equal(nextMaterialOrderNumber({ existing: [] }), "MO-Job-1001");

console.log("material-orders.test.ts ok");
