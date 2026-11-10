import assert from "node:assert/strict";
import { fillMaterialOrder } from "./material-orders.ts";
import {
  formatMaterialOrderDay,
  formatMaterialOrderIssued,
  groupPresentedLines,
  materialOrderBranchLine,
  materialOrderItemSummary,
  materialOrderWhenLabel,
  materialSectionForName,
  presentMaterialLine,
  supplierShortName,
} from "./material-order-presentation.ts";

assert.equal(materialSectionForName("Timberline HDZ shingles"), "Shingles");
assert.equal(materialSectionForName("Seal-A-Ridge hip & ridge"), "Shingles");
assert.equal(materialSectionForName("Pro-Start starter strip"), "Shingles");
assert.equal(materialSectionForName("FeltBuster synthetic underlayment"), "Underlayment");
assert.equal(materialSectionForName("WeatherWatch ice & water shield"), "Underlayment");
assert.equal(materialSectionForName("Cobra ridge vent"), "Ventilation");
assert.equal(materialSectionForName("Drip edge, 10 ft"), "Flashing & metal");
assert.equal(materialSectionForName("Pipe jack, 3 in"), "Flashing & metal");
assert.equal(materialSectionForName("Coil roofing nails, 1-1/4 in"), "Fasteners & sealants");
assert.equal(materialSectionForName("Roof sealant"), "Fasteners & sealants");
assert.equal(materialSectionForName("Custom dumpster"), "Other");

assert.equal(supplierShortName("Beacon Roofing Supply"), "Beacon");
assert.equal(supplierShortName("ABC Supply"), "ABC Supply");
assert.equal(supplierShortName("  "), "supplier");

assert.equal(formatMaterialOrderDay("2026-11-12"), "Thu, Nov 12");
assert.equal(formatMaterialOrderIssued("2026-11-09T18:00:00.000Z").includes("Nov 9, 2026"), true);
assert.equal(
  materialOrderWhenLabel({ neededBy: "2026-11-12", window: "morning", fulfillment: "delivery" }),
  "Thu, Nov 12 · Morning",
);
assert.equal(materialOrderBranchLine("", ""), "Branch [BRANCH] · Acct [ACCOUNT #]");
assert.equal(materialOrderBranchLine("Euless", "44821"), "Branch Euless · Acct 44821");

assert.deepEqual(materialOrderItemSummary([]), { ready: false, label: "None yet" });
assert.deepEqual(
  materialOrderItemSummary([
    { name: "Drip edge", unitCost: 9.8 },
    { name: "Nails", unitCost: 46 },
  ]),
  { ready: true, label: "2 · priced" },
);
assert.equal(materialOrderItemSummary([{ name: "Drip edge", unitCost: 0 }]).label, "1 · add prices");

const presented = presentMaterialLine(
  {
    id: "line-1",
    materialOrderId: "mo-1",
    catalogItemId: "cat-1",
    name: "Timberline HDZ shingles",
    quantity: 90,
    unit: "BD",
    unitCost: 41.5,
    sortOrder: 1,
  },
  { description: "GAF · Charcoal", costCode: "GAF-HDZ-CHR" },
);
assert.equal(presented.subtitle, "GAF · Charcoal · GAF-HDZ-CHR");
assert.equal(presented.section, "Shingles");
assert.equal(presented.amount, 3735);

const groups = groupPresentedLines([
  { section: "Fasteners & sealants", name: "nails" },
  { section: "Shingles", name: "field" },
  { section: "Shingles", name: "ridge" },
]);
assert.deepEqual(
  groups.map((group) => group.section),
  ["Shingles", "Fasteners & sealants"],
);
assert.equal(groups[0]?.lines.length, 2);

const filled = fillMaterialOrder({ id: "mo-1", number: "MO-1", jobId: "job-1" });
assert.equal(filled.status, "draft");
assert.equal(filled.fulfillment, "delivery");
assert.equal(filled.window, "morning");
assert.equal(filled.onCalendar, true);
assert.deepEqual(filled.quickNotes, []);
assert.equal(
  fillMaterialOrder({
    id: "mo-1",
    number: "MO-1",
    jobId: "job-1",
    status: "sent",
    quickNotes: ["Ground drop", "Call 30 min before"],
    onCalendar: false,
  }).onCalendar,
  false,
);

console.log("material-order-presentation.test.ts ok");
