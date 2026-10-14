import assert from "node:assert/strict";
import {
  invoiceEditLock,
  invoiceLineEditorModel,
  invoiceLineStoredFromEditor,
  splitInvoiceLine,
} from "./invoice-lines.ts";

assert.deepEqual(splitInvoiceLine("Progress draw"), { title: "Progress draw", description: "" });
assert.deepEqual(splitInvoiceLine("Roofing System\n\n- Tear-off\n- Underlayment"), {
  title: "Roofing System",
  description: "- Tear-off\n- Underlayment",
});

const stored = {
  description: "Roofing System\n\n- Tear-off",
  quantity: 32,
  unit: "sq",
  unitCost: 450,
};
assert.equal(invoiceLineEditorModel(stored).title, "Roofing System");
assert.equal(invoiceLineEditorModel(stored).description, "- Tear-off");
assert.deepEqual(invoiceLineStoredFromEditor(stored, { quantity: 30 }), { quantity: 30 });
assert.equal(
  invoiceLineStoredFromEditor(stored, { title: "Shingles" }).description,
  "Shingles\n\n- Tear-off",
);
assert.equal(
  invoiceLineStoredFromEditor({ description: "Deposit", unit: "" }, { title: "Deposit", description: "Due at start" })
    .description,
  "Deposit\n\nDue at start",
);

assert.equal(invoiceEditLock({ status: "draft", qbStatus: "not_in_qb", paid: 0 }).editable, true);
assert.equal(invoiceEditLock({ status: "draft", qbStatus: "not_in_qb", paid: 50 }).editable, false);
assert.equal(
  invoiceEditLock({ status: "sent", qbStatus: "not_in_qb", paid: 0 }).canReturnToDraft,
  true,
);
assert.equal(invoiceEditLock({ status: "sent", qbStatus: "not_in_qb", paid: 100 }).canReturnToDraft, false);
assert.equal(invoiceEditLock({ status: "sent", qbStatus: "entered", paid: 0 }).canReturnToDraft, false);
assert.equal(invoiceEditLock({ status: "void", qbStatus: "not_in_qb", paid: 0 }).editable, false);

console.log("invoice-lines tests passed");
