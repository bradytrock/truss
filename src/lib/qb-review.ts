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

export function qbApproveInbox(input: {
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  expenses: Expense[];
  payments: Payment[];
}) {
  const invoices = input.invoices.filter(
    (invoice) => invoice.status !== "draft" && invoice.status !== "void" && invoice.qbStatus !== "entered",
  );
  const expenses = input.expenses.filter((expense) => expense.qbStatus !== "entered");
  const payments = input.payments.filter((payment) => payment.qbStatus !== "entered");

  const items: QbReviewItem[] = [
    ...invoices.map((invoice) => ({ kind: "invoice" as const, id: invoice.id, invoice })),
    ...expenses.map((expense) => ({ kind: "expense" as const, id: expense.id, expense })),
    ...payments.map((payment) => ({ kind: "payment" as const, id: payment.id, payment })),
  ];

  const statusOf = (item: QbReviewItem): QbSyncStatus =>
    item.kind === "invoice"
      ? item.invoice.qbStatus
      : item.kind === "expense"
        ? item.expense.qbStatus
        : item.payment.qbStatus;

  const ready = items.filter((item) => isReadyToApprove(statusOf(item)));
  const returned = items.filter((item) => isWaitingOnPm(statusOf(item)));
  const queued = items.filter((item) => statusOf(item) === "queued");

  return {
    invoices,
    expenses,
    payments,
    ready,
    returned,
    queued,
    items,
    readyCount: ready.length,
    returnedCount: returned.length,
    queuedCount: queued.length,
    invoiceTotalDue: invoices
      .filter((invoice) => invoice.qbStatus !== "queued")
      .reduce((sum, invoice) => sum + invoiceTotal(invoice.id, input.invoiceLines), 0),
  };
}

export function reviewHref(kind: QbReviewKind, id: string) {
  return `/accounting/approve/${kind}/${id}`;
}

export function nextReviewItem(list: QbReviewItem[], kind: QbReviewKind, id: string) {
  const index = list.findIndex((item) => item.kind === kind && item.id === id);
  if (index < 0) return list[0] ?? null;
  return list[index + 1] ?? list[0] ?? null;
}

export function itemTitle(item: QbReviewItem) {
  if (item.kind === "invoice") return item.invoice.number;
  if (item.kind === "expense") return item.expense.vendor || item.expense.number;
  return item.payment.reference || item.payment.method || "Payment";
}

export function isReceiptPdf(url: string) {
  return /^data:application\/pdf/i.test(url) || /\.pdf(\?|$)/i.test(url);
}
