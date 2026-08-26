import { localDayInRange } from "@/lib/format";
import { invoiceTotal } from "@/lib/money";
import type {
  Expense,
  Invoice,
  InvoiceLine,
  Payment,
  QbReviewComment,
  QbReviewKind,
  QbSyncStatus,
} from "@/lib/types";

export type QbReviewItem =
  | { kind: "invoice"; id: string; invoice: Invoice }
  | { kind: "expense"; id: string; expense: Expense }
  | { kind: "payment"; id: string; payment: Payment };

export function commentsForRecord(
  comments: QbReviewComment[],
  kind: QbReviewKind,
  recordId: string,
) {
  return comments
    .filter((item) => item.kind === kind && item.recordId === recordId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function latestReturnNote(comments: QbReviewComment[], kind: QbReviewKind, recordId: string) {
  return [...commentsForRecord(comments, kind, recordId)]
    .reverse()
    .find((item) => item.intent === "return");
}

export function isWaitingOnPm(status: QbSyncStatus) {
  return status === "returned";
}

export function isReadyToApprove(status: QbSyncStatus) {
  return status === "not_in_qb" || status === "error";
}

export function invoiceSubmittedAt(invoice: Invoice) {
  return invoice.issuedAt;
}

export function reviewItemStatus(item: QbReviewItem): QbSyncStatus {
  return item.kind === "invoice"
    ? item.invoice.qbStatus
    : item.kind === "expense"
      ? item.expense.qbStatus
      : item.payment.qbStatus;
}

export function qbApproveInbox(input: {
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  expenses: Expense[];
  payments: Payment[];
  week?: { start: Date; end: Date } | null;
}) {
  const range = input.week ?? null;
  const weekInvoices = !range
    ? []
    : input.invoices
        .filter(
          (invoice) =>
            invoice.status !== "draft" &&
            invoice.status !== "void" &&
            localDayInRange(invoiceSubmittedAt(invoice), range.start, range.end),
        )
        .sort(
          (a, b) =>
            invoiceSubmittedAt(a).localeCompare(invoiceSubmittedAt(b)) || a.number.localeCompare(b.number),
        );
  const weekInvoiceIds = new Set(weekInvoices.map((invoice) => invoice.id));

  const pendingInvoices = input.invoices.filter(
    (invoice) =>
      invoice.status !== "draft" &&
      invoice.status !== "void" &&
      invoice.qbStatus !== "entered" &&
      !weekInvoiceIds.has(invoice.id),
  );
  const expenses = input.expenses.filter((expense) => expense.qbStatus !== "entered");
  const payments = input.payments.filter((payment) => payment.qbStatus !== "entered");

  const weekItems: QbReviewItem[] = weekInvoices.map((invoice) => ({
    kind: "invoice" as const,
    id: invoice.id,
    invoice,
  }));
  const items: QbReviewItem[] = [
    ...weekItems,
    ...pendingInvoices.map((invoice) => ({ kind: "invoice" as const, id: invoice.id, invoice })),
    ...expenses.map((expense) => ({ kind: "expense" as const, id: expense.id, expense })),
    ...payments.map((payment) => ({ kind: "payment" as const, id: payment.id, payment })),
  ];

  const otherItems = items.filter((item) => item.kind !== "invoice" || !weekInvoiceIds.has(item.id));
  const ready = otherItems.filter((item) => isReadyToApprove(reviewItemStatus(item)));
  const returned = otherItems.filter((item) => isWaitingOnPm(reviewItemStatus(item)));
  const queued = otherItems.filter((item) => reviewItemStatus(item) === "queued");

  return {
    invoices: weekInvoices,
    expenses,
    payments,
    weekItems,
    ready,
    returned,
    queued,
    items,
    readyCount: ready.length,
    returnedCount: returned.length,
    queuedCount: queued.length,
    weekInvoiceCount: weekItems.length,
    invoiceTotalDue: weekInvoices.reduce(
      (sum, invoice) => sum + invoiceTotal(invoice.id, input.invoiceLines),
      0,
    ),
  };
}

export function reviewHref(kind: QbReviewKind, id: string, weekParam?: string) {
  const path = `/accounting/approve/${kind}/${id}`;
  return weekParam ? `${path}?week=${weekParam}` : path;
}

export function approveHref(weekParam?: string) {
  return weekParam ? `/accounting/approve?week=${weekParam}` : "/accounting/approve";
}

export function findReviewItem(
  book: { invoices: Invoice[]; expenses: Expense[]; payments: Payment[] },
  kind: QbReviewKind,
  id: string,
): QbReviewItem | null {
  if (kind === "invoice") {
    const invoice = book.invoices.find((row) => row.id === id);
    return invoice ? { kind, id, invoice } : null;
  }
  if (kind === "expense") {
    const expense = book.expenses.find((row) => row.id === id);
    return expense ? { kind, id, expense } : null;
  }
  const payment = book.payments.find((row) => row.id === id);
  return payment ? { kind, id, payment } : null;
}

export function nextReviewItem(list: QbReviewItem[], kind: QbReviewKind, id: string) {
  const index = list.findIndex((item) => item.kind === kind && item.id === id);
  if (index < 0) return list[0] ?? null;
  return list[index + 1] ?? list[0] ?? null;
}

export function nextApproveItem(
  inbox: ReturnType<typeof qbApproveInbox>,
  kind: QbReviewKind,
  id: string,
) {
  const pendingWeek = inbox.weekItems.filter((item) => isReadyToApprove(reviewItemStatus(item)));
  return nextReviewItem([...pendingWeek, ...inbox.ready], kind, id);
}

export function itemTitle(item: QbReviewItem) {
  if (item.kind === "invoice") return item.invoice.number;
  if (item.kind === "expense") return item.expense.vendor || item.expense.number;
  return item.payment.reference || item.payment.method || "Payment";
}

export function isReceiptPdf(url: string) {
  return /^data:application\/pdf/i.test(url) || /\.pdf(\?|$)/i.test(url);
}
