import assert from "node:assert/strict";
import { billAddXml, expenseRetHasJobCustomer, invoiceAddXml, signedInvoiceQtyRate, txnVoidXml } from "./qbxml.ts";
import { advanceFromResponse, receiveWorkAdvance, requestForStep } from "./steps.ts";
import {
  expenseRepairsBill,
  expenseReplacesCheck,
  parseWorkPayload,
  resolveQbwcStep,
  type QbExpenseWork,
  type QbInvoiceWork,
} from "./work.ts";

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
assert.equal(resolveQbwcStep("expense_add", expenseWork), "job_query");
assert.equal(resolveQbwcStep("txn_void+alias", expenseWork), "job_query+alias");
assert.equal(resolveQbwcStep("expense_add", { ...expenseWork, jobListId: "80000012-1789520000" }), "expense_add");
assert.equal(resolveQbwcStep("vendor_query", expenseWork), "vendor_query");
const jobFound =
  "<CustomerQueryRs statusCode=\"0\"><CustomerRet><ListID>80000012-1789520000</ListID><FullName>Ojamaye:BJ091026-A</FullName></CustomerRet></CustomerQueryRs>";
const queriedFromBill = receiveWorkAdvance({
  step: "expense_add",
  responseXml: jobFound,
  work: expenseWork,
});
assert.equal(queriedFromBill.action, "next");
assert.equal(queriedFromBill.action === "next" ? queriedFromBill.step : "", "expense_add");
assert.equal(queriedFromBill.action === "next" ? queriedFromBill.jobListId : "", "80000012-1789520000");

const billXml = requestForStep("expense_add", expenseWork);
assert.match(billXml, /<CustomerQueryRq/);
assert.match(billXml, /<FullName>Ojamaye:BJ091026-A<\/FullName>/);
assert.doesNotMatch(billXml, /<BillAddRq/);

const billedOnJob = requestForStep("expense_add", { ...expenseWork, jobListId: "80000012-1789520000" });
assert.match(billedOnJob, /<BillAddRq/);
assert.match(billedOnJob, /<VendorRef>[\s\S]*Silva&apos;s Sheet Metal LLC/);
assert.match(billedOnJob, /<CustomerRef>[\s\S]*<ListID>80000012-1789520000<\/ListID>/);
assert.match(billedOnJob, /<BillableStatus>NotBillable<\/BillableStatus>/);
assert.doesNotMatch(billedOnJob, /<CustomerRef>[\s\S]*<FullName>/);
assert.doesNotMatch(billedOnJob, /<CheckAddRq/);
assert.doesNotMatch(billAddXml({
  requestId: "e-no-job",
  vendor: "Vendor",
  txnDate: "2026-09-10",
  accountName: "Subcontractors",
  amount: 10,
  customerJobFullName: "Ojamaye:BJ091026-A",
}), /<CustomerRef>/);

const jobListId = "80000012-1789520000";
const replaceWork = { ...expenseWork, replaceTxnId: "43-1789510995", jobListId };
assert.equal(expenseReplacesCheck(replaceWork), true);
assert.equal(expenseReplacesCheck(expenseWork), false);
assert.equal(expenseRepairsBill(replaceWork), false);
const repairWork = { ...expenseWork, replaceTxnId: "49-1789524336", replaceTxnKind: "bill" as const, jobListId };
assert.equal(expenseRepairsBill(repairWork), true);
assert.equal(expenseReplacesCheck(repairWork), false);
assert.match(requestForStep("txn_void", repairWork), /<TxnVoidType>Bill<\/TxnVoidType>/);
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
assert.equal(advanceFromResponse("job_add", jobOk, "", repairWork).step, "txn_void");
const jobExists = "<CustomerAddRs statusCode=\"3100\" statusMessage=\"The name is already in use.\" />";
assert.equal(advanceFromResponse("job_add", jobExists, "", expenseWork).step, "job_query");
assert.equal(advanceFromResponse("job_add+alias", jobExists, "", expenseWork).step, "job_query+alias");
const jobFoundNoId = "<CustomerQueryRs statusCode=\"0\"><CustomerRet><FullName>Ojamaye:BJ091026-A</FullName></CustomerRet></CustomerQueryRs>";
assert.equal(advanceFromResponse("job_query", jobFoundNoId, "", expenseWork).action, "fail");
const billNoJob =
  "<BillAddRs statusCode=\"0\"><BillRet><TxnID>49-1</TxnID><ExpenseLineRet><Amount>2800.00</Amount></ExpenseLineRet></BillRet></BillAddRs>";
const hungOffJob = advanceFromResponse("expense_add", billNoJob, "", expenseWork);
assert.equal(hungOffJob.action, "fail");
assert.equal(hungOffJob.action === "fail" ? hungOffJob.txnId : "", "49-1");
const billOnJob =
  "<BillAddRs statusCode=\"0\"><BillRet><TxnID>50-1</TxnID><ExpenseLineRet><CustomerRef><ListID>80000012-1789520000</ListID></CustomerRef></ExpenseLineRet></BillRet></BillAddRs>";
assert.equal(advanceFromResponse("expense_add", billOnJob, "", { ...expenseWork, jobListId }).action, "complete");
assert.equal(
  advanceFromResponse("expense_add", billNoJob, "", { ...expenseWork, hasJob: false, jobCode: "" }).action,
  "complete",
);
assert.equal(expenseRetHasJobCustomer(billOnJob), true);
assert.equal(expenseRetHasJobCustomer(billNoJob), false);
assert.equal(
  receiveWorkAdvance({
    step: "txn_void",
    responseXml: "",
    hresult: "0x80040400",
    message: lockMessage,
    work: repairWork,
  }).action,
  "fail",
);

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
  jobListId: "80000012-1789520000",
});
assert.equal(apPayload && apPayload.kind === "expense" && apPayload.payWith, "bill");
if (apPayload && apPayload.kind === "expense") {
  const apXml = requestForStep("expense_add", apPayload);
  assert.match(apXml, /<BillAddRq/);
  assert.match(apXml, /<ListID>80000012-1789520000<\/ListID>/);
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

const repairPayload = parseWorkPayload({
  kind: "expense",
  expenseId: "exp-repair",
  vendor: "Silva's Sheet Metal LLC",
  payWith: "bill",
  hasJob: true,
  customerName: "Don Ojamaye",
  jobCode: "BJ091026-A",
  replaceTxnId: "49-1789524336",
  replaceTxnKind: "bill",
  jobListId: "80000012-1789520000",
});
assert.equal(repairPayload && repairPayload.kind === "expense" && repairPayload.replaceTxnKind, "bill");
if (repairPayload && repairPayload.kind === "expense") {
  assert.match(requestForStep("expense_add", repairPayload), /<ListID>80000012-1789520000<\/ListID>/);
}
if (checkMethod && checkMethod.kind === "expense") {
  assert.match(requestForStep("expense_add", checkMethod), /<BillAddRq/);
}
