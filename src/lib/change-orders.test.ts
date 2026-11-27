import assert from "node:assert/strict";
import {
  acceptedChangeOrderDelta,
  changeOrderContractFigures,
  changeOrderTotals,
  displayContractAmount,
  nextChangeOrderNumber,
  revisedContractTotal,
  type ChangeOrder,
  type ChangeOrderLine,
} from "./change-orders.ts";

function order(patch: Partial<ChangeOrder> & Pick<ChangeOrder, "id" | "status">): ChangeOrder {
  return {
    number: "CO-1",
    jobId: "job",
    estimateId: "est",
    opportunityId: null,
    clientId: null,
    reason: "Dry rot",
    notes: "",
    taxRate: 0,
    baseTotal: 18000,
    shareToken: "token",
    sentAt: null,
    viewedAt: null,
    acceptedAt: null,
    signatureName: "",
    signatureImage: "",
    invoiceId: null,
    createdBy: "",
    createdAt: "2026-11-01T00:00:00.000Z",
    ...patch,
  };
}

function line(patch: Partial<ChangeOrderLine> & Pick<ChangeOrderLine, "id" | "changeOrderId">): ChangeOrderLine {
  return {
    catalogItemId: null,
    title: "Ridge",
    description: "",
    quantity: 1,
    unit: "LF",
    unitCost: 1200,
    taxable: true,
    sortOrder: 0,
    ...patch,
  };
}

const draft = order({ id: "co1", status: "draft" });
const lines = [line({ id: "l1", changeOrderId: "co1", quantity: 2, unitCost: 600 })];

assert.equal(changeOrderTotals(draft, lines).total, 1200);
assert.equal(changeOrderTotals({ taxRate: 8 }, lines).tax, 96);
assert.equal(changeOrderTotals({ taxRate: 8 }, lines).total, 1296);

const credit = line({ id: "l2", changeOrderId: "co1", quantity: 1, unitCost: -400, taxable: true });
assert.equal(changeOrderTotals({ taxRate: 10 }, [credit]).total, -440);

const signed = order({
  id: "co1",
  status: "accepted",
  acceptedAt: "2026-11-02T00:00:00.000Z",
});
const second = order({
  id: "co2",
  number: "CO-2",
  status: "accepted",
  taxRate: 0,
  baseTotal: 18000,
});
const secondLine = line({ id: "l3", changeOrderId: "co2", quantity: 1, unitCost: 500, taxable: false });

assert.equal(acceptedChangeOrderDelta("job", [signed, second], [...lines, secondLine]), 1700);
assert.equal(revisedContractTotal("job", [signed, second], [...lines, secondLine]), 19700);
assert.equal(
  revisedContractTotal("job", [signed, order({ id: "voided", status: "void" })], lines),
  19200,
);

const prior = order({
  id: "prior",
  number: "CO-9",
  status: "accepted",
  acceptedAt: "2026-11-02T00:00:00.000Z",
});
const priorLine = line({ id: "lp", changeOrderId: "prior", quantity: 1, unitCost: 1200, taxable: false });
const figures = changeOrderContractFigures(draft, [prior], [...lines, priorLine]);
assert.equal(figures.before, 19200);
assert.equal(figures.delta, 1200);
assert.equal(figures.after, 20400);

const declined = changeOrderContractFigures(order({ id: "co1", status: "declined" }), [], lines);
assert.equal(declined.after, 18000);

assert.equal(
  displayContractAmount({
    signedTotal: 18000,
    contractValue: 18000,
    jobId: "job",
    orders: [signed],
    lines,
  }),
  19200,
);
assert.equal(
  displayContractAmount({
    signedTotal: 18000,
    contractValue: 25000,
    jobId: "job",
    orders: [],
    lines: [],
  }),
  18000,
);

assert.equal(nextChangeOrderNumber([]), "CO-1");
assert.equal(nextChangeOrderNumber(["CO-1", "CO-2", "EST-9"]), "CO-3");

console.log("change-orders.test.ts ok");
