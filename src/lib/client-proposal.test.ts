import assert from "node:assert/strict";
import { clientFacingSharePayload } from "./client-proposal.ts";

const payload = clientFacingSharePayload({
  customer: "Shawn",
  estimate: {
    id: "e1",
    number: "EST-1",
    name: "Roof",
    status: "sent",
    createdAt: "2026-09-15",
    taxRate: 0,
    discountKind: "percent",
    discountValue: 0,
    depositKind: "percent",
    depositValue: 0,
    marginPercent: 25,
    hideLinePrices: false,
  },
  lines: [
    {
      id: "l1",
      estimateId: "e1",
      title: "Shingles",
      quantity: 1,
      unit: "LS",
      unitCost: 8000,
      optional: false,
      selected: true,
      taxable: true,
    },
  ],
});

assert.ok(payload);
assert.equal(payload?.estimate.marginPercent, 0);
assert.equal(payload?.lines[0]?.unitCost, 10000);

console.log("client-proposal.test.ts ok");
