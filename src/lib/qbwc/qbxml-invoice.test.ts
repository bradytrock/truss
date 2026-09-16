import assert from "node:assert/strict";
import { billAddXml, invoiceAddXml, signedInvoiceQtyRate, txnVoidXml } from "./qbxml.ts";
import { advanceFromResponse, receiveWorkAdvance, requestForStep } from "./steps.ts";
import { expenseReplacesCheck, parseWorkPayload, type QbExpenseWork, type QbInvoiceWork } from "./work.ts";

assert.deepEqual(signedInvoiceQtyRate(1, 7482.12), { quantity: 1, unitCost: 7482.12 });
assert.deepEqual(signedInvoiceQtyRate(1, -1000), { quantity: -1, unitCost: 1000 });
assert.deepEqual(signedInvoiceQtyRate(2, -50), { quantity: -2, unitCost: 50 });

const xml = invoiceAddXml({
  requestId: "inv-1-invoice_add",
  customerJobFullName: "Ojamaye:BJ091026-A",
  refNumber: "INV-1002",
  txnDate: "2026-09-10",
  itemName: "Contract work",
  lines: [
    { description: "Concrete Tile Roof Repair", quantity: 1, unit: "ea", unitCost: 7482.12 },
    { description: "Discount", quantity: 1, unit: "LS", unitCost: -1000 },
  ],
});
assert.match(xml, /<Quantity>1<\/Quantity>[\s\S]*<Rate>7482.12<\/Rate>/);
assert.match(xml, /<Quantity>-1<\/Quantity>[\s\S]*<Rate>1000.00<\/Rate>/);
assert.doesNotMatch(xml, /<Quantity>1<\/Quantity>[\s\S]*<Rate>-1000.00<\/Rate>/);

const invoiceWork: QbInvoiceWork = {
  kind: "invoice",
  invoiceId: "inv-1",
  number: "INV-1002",
  name: "Ojamaye",
  issuedAt: "2026-09-10",
  dueAt: null,
  notes: "",
  customerName: "Ojamaye",
  jobCode: "BJ091026-A",
  jobName: "Ojamaye",
  street: "",
  city: "",
  state: "",
  postalCode: "",
  phone: "",
  itemName: "Contract work",
  lines: [{ description: "Discount", quantity: 1, unit: "LS", unitCost: -1000 }],
};
assert.match(requestForStep("invoice_add", invoiceWork), /<Quantity>-1<\/Quantity>/);

const expenseWork: QbExpenseWork = {
  kind: "expense",
  expenseId: "exp-1",
  number: "EXP-1001",
  vendor: "Silva's Sheet Metal LLC",
  accountName: "Subcontractors",
  amount: 2800,
  payWith: "bill",
  txnDate: "2026-09-10",
  memo: "",
  payAccount: "Checking",
  customerName: "Ojamaye",
  jobCode: "BJ091026-A",
  jobName: "Ojamaye",
  street: "",
  city: "",
  state: "",
  postalCode: "",
  phone: "",
  hasJob: true,
};
const billXml = requestForStep("expense_add", expenseWork);
assert.match(billXml, /<BillAddRq/);
assert.match(billXml, /<VendorRef>[\s\S]*Silva&apos;s Sheet Metal LLC/);
assert.match(billXml, /<CustomerRef>[\s\S]*Ojamaye:BJ091026-A/);
assert.match(billXml, /<BillableStatus>NotBillable<\/BillableStatus>/);
assert.doesNotMatch(billXml, /<CheckAddRq/);

const replaceWork = { ...expenseWork, replaceTxnId: "43-1789510995" };
assert.equal(expenseReplacesCheck(replaceWork), true);
assert.equal(expenseReplacesCheck(expenseWork), false);
const voidXml = requestForStep("txn_void", replaceWork);
assert.match(voidXml, /<TxnVoidRq/);
assert.match(voidXml, /<TxnVoidType>Check<\/TxnVoidType>/);
assert.match(voidXml, /<TxnID>43-1789510995<\/TxnID>/);
assert.equal(
  advanceFromResponse("txn_void", "<TxnVoidRs statusCode=\"0\" />").action,
  "next",
);
assert.equal(
  advanceFromResponse("txn_void", "<TxnVoidRs statusCode=\"3120\" statusMessage=\"Object not found\" />").step,
  "expense_add",
);
const lockMessage =
  'Cannot void the object specified by the id = "43-1789510995".  QuickBooks error message: The transaction could not be locked.  It is in use by another user.';
assert.equal(advanceFromResponse("txn_void", "", lockMessage, replaceWork).action, "next");
assert.equal(advanceFromResponse("txn_void", "", lockMessage, replaceWork).step, "expense_add");
assert.equal(
  advanceFromResponse(
    "txn_void",
    `<TxnVoidRs statusCode="3180" statusMessage="${lockMessage}" />`,
    lockMessage,
    replaceWork,
  ).step,
  "expense_add",
);
assert.equal(
  receiveWorkAdvance({
    step: "txn_void",
    responseXml: "",
    hresult: "0x80040400",
    message: lockMessage,
    work: replaceWork,
  }).action,
  "next",
);
assert.equal(
  receiveWorkAdvance({
    step: "txn_void+alias",
    responseXml: "",
    hresult: "0x80040400",
    message: lockMessage,
    work: replaceWork,
  }).step,
  "expense_add+alias",
);
assert.equal(
  receiveWorkAdvance({
    step: "expense_add",
    responseXml: "",
    hresult: "0x80040400",
    message: "Something else failed",
    work: expenseWork,
  }).action,
  "fail",
);
const jobOk = "<CustomerAddRs statusCode=\"0\"><CustomerRet><ListID>1</ListID></CustomerRet></CustomerAddRs>";
assert.equal(advanceFromResponse("job_add", jobOk, "", replaceWork).step, "expense_add");
assert.equal(advanceFromResponse("job_add", jobOk, "", expenseWork).step, "expense_add");

assert.match(
  txnVoidXml({ requestId: "e1-txn_void", txnType: "Check", txnId: "46-1789511000" }),
  /<TxnID>46-1789511000<\/TxnID>/,
);

const checkXml = billAddXml({
  requestId: "e1",
  vendor: "Vendor",
  txnDate: "2026-09-10",
  accountName: "Subcontractors",
  amount: 10,
});
assert.match(checkXml, /<BillAdd>/);

const apPayload = parseWorkPayload({
  kind: "expense",
  expenseId: "exp-ap",
  number: "EXP-1001",
  vendor: "Silva's Sheet Metal LLC",
  accountName: "Subcontractors",
  amount: 2800,
  payWith: "bill",
  payAccount: "Accounts Payable",
  customerName: "Don Ojamaye",
  jobCode: "BJ091026-A",
  hasJob: true,
});
assert.equal(apPayload && apPayload.kind === "expense" && apPayload.payWith, "bill");
if (apPayload && apPayload.kind === "expense") {
  const apXml = requestForStep("expense_add", apPayload);
  assert.match(apXml, /<BillAddRq/);
  assert.doesNotMatch(apXml, /<CheckAddRq/);
  assert.doesNotMatch(apXml, /<AccountRef>[\s\S]*Accounts Payable/);
}

const apAsCheck = parseWorkPayload({
  kind: "expense",
  expenseId: "exp-ap2",
  vendor: "Economy Stucco LLC",
  payWith: "check",
  payAccount: "Accounts Payable",
  hasJob: true,
  customerName: "Don Ojamaye",
  jobCode: "BJ091026-A",
});
assert.equal(apAsCheck && apAsCheck.kind === "expense" && apAsCheck.payWith, "bill");

const checkMethod = parseWorkPayload({
  kind: "expense",
  expenseId: "exp-check",
  vendor: "Vendor Co",
  payWith: "check",
  payAccount: "Checking",
});
assert.equal(checkMethod && checkMethod.kind === "expense" && checkMethod.payWith, "bill");
if (checkMethod && checkMethod.kind === "expense") {
  assert.match(requestForStep("expense_add", checkMethod), /<BillAddRq/);
}
