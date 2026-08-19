import type { Invoice, InvoiceLine, Payment } from "@/lib/types";
import { daysUntil } from "@/lib/format";

export function lineAmount(line: { quantity: number; unitCost: number }) {
  return line.quantity * line.unitCost;
}

export function sumLines(lines: { quantity: number; unitCost: number }[]) {
  return lines.reduce((sum, line) => sum + lineAmount(line), 0);
}

export function paidOnInvoice(invoiceId: string, payments: Payment[]) {
  return payments
    .filter((payment) => payment.invoiceId === invoiceId)
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function invoiceTotal(invoiceId: string, lines: InvoiceLine[]) {
  return sumLines(lines.filter((line) => line.invoiceId === invoiceId));
}

export function invoiceBalance(invoiceId: string, lines: InvoiceLine[], payments: Payment[]) {
  return Math.max(0, invoiceTotal(invoiceId, lines) - paidOnInvoice(invoiceId, payments));
}

export function derivedInvoiceStatus(
  invoice: Invoice,
  lines: InvoiceLine[],
  payments: Payment[]
) {
  if (invoice.status === "void" || invoice.status === "draft") return invoice.status;
  const total = invoiceTotal(invoice.id, lines);
  const paid = paidOnInvoice(invoice.id, payments);
  if (total > 0 && paid >= total) return "paid" as const;
  if (paid > 0) return "partial" as const;
  const due = daysUntil(invoice.dueAt);
  if (due !== null && due < 0) return "overdue" as const;
  return invoice.status;
}

export function nextNumber(prefix: string, existing: string[]) {
  const max = existing.reduce((current, value) => {
    const match = value.match(/(\d+)$/);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 1000);
  return `${prefix}-${max + 1}`;
}
