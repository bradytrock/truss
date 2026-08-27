import { localDayInRange } from "@/lib/format";
import { invoiceTotal } from "@/lib/money";
import { namesMatch } from "@/lib/seats";
import type {
  Expense,
  Invoice,
  InvoiceLine,
  Job,
  Payment,
  QbReviewComment,
  QbReviewKind,
  QbSyncStatus,
  StaffMember,
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

export function reviewItemJobId(item: QbReviewItem) {
  if (item.kind === "invoice") return item.invoice.jobId;
  if (item.kind === "expense") return item.expense.jobId;
  return item.payment.jobId;
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

export function jobDocumentHref(jobId: string, kind: QbReviewKind, id: string) {
  return `/jobs?job=${encodeURIComponent(jobId)}&tab=files&doc=${kind}:${id}`;
}

export function jobFilesHref(jobId: string) {
  return `/jobs?job=${encodeURIComponent(jobId)}&tab=files`;
}

export function parseJobDocParam(value: string | null | undefined): { kind: QbReviewKind; id: string } | null {
  if (!value) return null;
  const separator = value.indexOf(":");
  if (separator < 1) return null;
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!id) return null;
  if (kind === "invoice" || kind === "expense" || kind === "payment") return { kind, id };
  return null;
}

export function formatJobDocParam(kind: QbReviewKind, id: string) {
  return `${kind}:${id}`;
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

export function itemKindLabel(kind: QbReviewKind) {
  if (kind === "invoice") return "Invoice";
  if (kind === "expense") return "Expense";
  return "Payment";
}

export function isReceiptPdf(url: string) {
  return /^data:application\/pdf/i.test(url) || /\.pdf(\?|$)/i.test(url);
}

export function activeMentionQuery(body: string) {
  const match = /(?:^|\s)@([^\n@]*)$/.exec(body);
  if (!match) return null;
  return match[1] ?? "";
}

export function mentionCandidates(staff: StaffMember[], query: string) {
  const needle = query.trim().toLowerCase();
  return staff
    .filter((member) => !member.locked)
    .filter((member) => {
      if (!needle) return true;
      return (
        member.name.toLowerCase().includes(needle) ||
        member.initials.toLowerCase().includes(needle) ||
        member.title.toLowerCase().includes(needle)
      );
    })
    .slice(0, 8);
}

export function insertMention(body: string, name: string) {
  return body.replace(/(?:^|\s)@([^\n@]*)$/, (chunk) => {
    const prefix = /^\s/.test(chunk) ? chunk[0] : "";
    return `${prefix}@${name} `;
  });
}

export function parseMentionedStaff(body: string, staff: StaffMember[]) {
  const named = [...staff]
    .filter((member) => !member.locked && member.name.trim())
    .sort((a, b) => b.name.length - a.name.length);
  const found = new Map<string, StaffMember>();
  for (const member of named) {
    const pattern = new RegExp(`@${escapeRegExp(member.name)}\\b`, "i");
    if (pattern.test(body)) found.set(member.id, member);
  }
  return [...found.values()];
}

export function commentMentionedStaff(comment: QbReviewComment, staff: StaffMember[]) {
  const byId = staff.filter((member) => comment.mentionedStaffIds.includes(member.id));
  if (byId.length > 0) return byId;
  return parseMentionedStaff(comment.body, staff);
}

export function commentMentionsStaff(comment: QbReviewComment, staff: StaffMember, roster: StaffMember[]) {
  if (comment.mentionedStaffIds.includes(staff.id)) return true;
  return commentMentionedStaff(comment, roster).some((member) => member.id === staff.id);
}

export function staffOwnsJob(job: Job | undefined, staff: StaffMember | undefined) {
  if (!job || !staff) return false;
  if (job.ownerStaffId && job.ownerStaffId === staff.id) return true;
  return namesMatch(job.projectManager, staff.name) || job.assigned.some((name) => namesMatch(name, staff.name));
}

export type PmReviewNotice = {
  item: QbReviewItem;
  jobId: string;
  reason: "returned" | "tagged";
  preview: string;
};

export function pmReviewNotices(input: {
  staff: StaffMember;
  roster: StaffMember[];
  jobs: Job[];
  invoices: Invoice[];
  expenses: Expense[];
  payments: Payment[];
  comments: QbReviewComment[];
}): PmReviewNotice[] {
  const notices: PmReviewNotice[] = [];
  const seen = new Set<string>();

  function push(item: QbReviewItem, jobId: string, reason: "returned" | "tagged", preview: string) {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    notices.push({ item, jobId, reason, preview });
  }

  const book = { invoices: input.invoices, expenses: input.expenses, payments: input.payments };
  for (const job of input.jobs) {
    if (!staffOwnsJob(job, input.staff)) continue;
    const invoices = input.invoices.filter((invoice) => invoice.jobId === job.id && invoice.qbStatus === "returned");
    const expenses = input.expenses.filter((expense) => expense.jobId === job.id && expense.qbStatus === "returned");
    const payments = input.payments.filter((payment) => payment.jobId === job.id && payment.qbStatus === "returned");
    for (const invoice of invoices) {
      const note = latestReturnNote(input.comments, "invoice", invoice.id);
      push({ kind: "invoice", id: invoice.id, invoice }, job.id, "returned", note?.body ?? "Accounting sent this back.");
    }
    for (const expense of expenses) {
      const note = latestReturnNote(input.comments, "expense", expense.id);
      push({ kind: "expense", id: expense.id, expense }, job.id, "returned", note?.body ?? "Accounting sent this back.");
    }
    for (const payment of payments) {
      const note = latestReturnNote(input.comments, "payment", payment.id);
      push({ kind: "payment", id: payment.id, payment }, job.id, "returned", note?.body ?? "Accounting sent this back.");
    }
  }

  for (const comment of input.comments) {
    if (comment.authorStaffId === input.staff.id) continue;
    if (!commentMentionsStaff(comment, input.staff, input.roster)) continue;
    const item = findReviewItem(book, comment.kind, comment.recordId);
    const jobId = item ? reviewItemJobId(item) : null;
    if (!item || !jobId) continue;
    push(item, jobId, isWaitingOnPm(reviewItemStatus(item)) ? "returned" : "tagged", comment.body);
  }

  return notices;
}

export function jobFinancialDocs(jobId: string, book: { invoices: Invoice[]; expenses: Expense[]; payments: Payment[] }) {
  const invoices = book.invoices.filter((invoice) => invoice.jobId === jobId && invoice.status !== "void");
  const expenses = book.expenses.filter((expense) => expense.jobId === jobId);
  const payments = book.payments.filter((payment) => payment.jobId === jobId);
  const items: QbReviewItem[] = [
    ...invoices.map((invoice) => ({ kind: "invoice" as const, id: invoice.id, invoice })),
    ...expenses.map((expense) => ({ kind: "expense" as const, id: expense.id, expense })),
    ...payments.map((payment) => ({ kind: "payment" as const, id: payment.id, payment })),
  ];
  return items.sort((a, b) => itemTitle(a).localeCompare(itemTitle(b)));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
