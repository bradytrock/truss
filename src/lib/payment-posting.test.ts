import assert from "node:assert/strict";
import {
  cardPayRemaining,
  isPendingPayment,
  isPostedPayment,
  paymentMethodLabel,
  pendingCardOnInvoice,
  postedPaidOnInvoice,
} from "./payment-posting.ts";
import { derivedInvoiceStatus, invoiceBalance, paidOnInvoice } from "./money.ts";
import type { Invoice, InvoiceLine, Payment } from "./types.ts";

function payment(partial: Partial<Payment> & Pick<Payment, "id" | "amount">): Payment {
  return {
    invoiceId: partial.invoiceId ?? "inv-1",
    jobId: partial.jobId ?? "job-1",
    method: partial.method ?? "card",
    paidAt: partial.paidAt ?? "2026-09-16",
    reference: partial.reference ?? "",
    receiptUrl: partial.receiptUrl ?? "",
    receiptStoragePath: partial.receiptStoragePath ?? null,
    qbStatus: partial.qbStatus ?? "not_in_qb",
    createdBy: partial.createdBy ?? "",
    postingStatus: partial.postingStatus,
    estimateId: partial.estimateId ?? null,
    amount: partial.amount,
    id: partial.id,
  };
}

const posted = payment({ id: "p1", amount: 400, postingStatus: "posted", method: "check" });
const pending = payment({ id: "p2", amount: 400, postingStatus: "pending", method: "card" });
const rejected = payment({ id: "p3", amount: 50, postingStatus: "rejected", method: "card" });
const legacy = payment({ id: "p4", amount: 100, method: "check" });

assert.equal(isPostedPayment(posted), true);
assert.equal(isPostedPayment(legacy), true);
assert.equal(isPostedPayment(pending), false);
assert.equal(isPendingPayment(pending), true);
assert.equal(isPostedPayment(rejected), false);

const rows = [posted, pending, rejected, legacy];
assert.equal(postedPaidOnInvoice("inv-1", rows), 500);
assert.equal(pendingCardOnInvoice("inv-1", rows), 400);
assert.equal(paidOnInvoice("inv-1", rows), 500);

const lines: InvoiceLine[] = [
  { id: "l1", invoiceId: "inv-1", description: "Work", quantity: 1, unit: "ea", unitCost: 1000, sortOrder: 0 },
];
assert.equal(invoiceBalance("inv-1", lines, rows), 500);
assert.equal(cardPayRemaining(500, 400), 100);
assert.equal(cardPayRemaining(400, 400), 0);

const invoice: Invoice = {
  id: "inv-1",
  number: "INV-1001",
  name: "Job",
  clientId: null,
  jobId: "job-1",
  estimateId: null,
  status: "sent",
  issuedAt: "2026-09-01",
  dueAt: "2026-09-30",
  notes: "",
  terms: "",
  shareToken: "tok",
  qbStatus: "not_in_qb",
};
assert.equal(derivedInvoiceStatus(invoice, lines, [pending]), "sent");
assert.equal(derivedInvoiceStatus(invoice, lines, [posted, legacy]), "partial");
assert.equal(paymentMethodLabel("card"), "Card");

console.log("payment-posting tests passed");
