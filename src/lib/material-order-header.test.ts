import assert from "node:assert/strict";
import { materialOrderOrderedByLine } from "./material-order-header.ts";

assert.equal(materialOrderOrderedByLine({}), "");
assert.equal(materialOrderOrderedByLine({ name: "  " }), "");
assert.equal(materialOrderOrderedByLine({ name: "Alex Rivera" }), "Ordered by Alex Rivera");
assert.equal(
  materialOrderOrderedByLine({
    name: "Alex Rivera",
    phone: "(214) 555-0100",
    email: "alex@northline.co",
  }),
  "Ordered by Alex Rivera · (214) 555-0100 · alex@northline.co",
);
assert.equal(
  materialOrderOrderedByLine({ name: "Alex Rivera", email: "alex@northline.co" }),
  "Ordered by Alex Rivera · alex@northline.co",
);

console.log("material-order-header.test.ts ok");
