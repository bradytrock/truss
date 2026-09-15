import { daysUntil } from "@/lib/format";
import { jobProfitAndLoss, type JobBooksBasis } from "@/lib/job-financials";
import { invoiceBalance, invoiceTotal } from "@/lib/money";
import {
  DEFAULT_QB_BANK,
  DEFAULT_QB_CC,
  expensePushBlocked,
  expenseRequiresJob,
  invoicePushBlocked,
} from "@/lib/qbwc/work";
import {
  EXPENSE_ACCOUNT_LABELS,
  EXPENSE_METHOD_LABELS,
  type Expense,
  type ExpenseMethod,
  type Invoice,
  type InvoiceLine,
  type Job,
  type Payment,
} from "@/lib/types";

export const ACCOUNTING_TABS = ["overview", "review", "expenses", "sync", "reports", "tools"] as const;
export type AccountingTab = (typeof ACCOUNTING_TABS)[number];

export const INVOICE_REVIEW_FILTERS = ["all", "ready", "needs_review", "held"] as const;
export type InvoiceReviewFilter = (typeof INVOICE_REVIEW_FILTERS)[number];

export type InvoiceReviewStatus = "ready" | "needs_review" | "held" | "queued";

export const INVOICE_REVIEW_LABELS: Record<InvoiceReviewStatus, string> = {
  ready: "Ready",
  needs_review: "Needs review",
  held: "Held",
  queued: "Queued",
};

export function parseAccountingTab(raw: string | null): AccountingTab {
  return ACCOUNTING_TABS.includes(raw as AccountingTab) ? (raw as AccountingTab) : "overview";
}

export function parseInvoiceReviewFilter(raw: string | null): InvoiceReviewFilter {
  return INVOICE_REVIEW_FILTERS.includes(raw as InvoiceReviewFilter)
    ? (raw as InvoiceReviewFilter)
    : "all";
}

export function isOpenInvoice(invoice: Invoice) {
  return invoice.status !== "draft" && invoice.status !== "void";
}

export function invoiceReviewStatus(
  invoice: Invoice,
  blocked: string | null,
): InvoiceReviewStatus {
  if (invoice.qbStatus === "queued") return "queued";
  if (invoice.qbStatus === "returned") return "held";
  if (invoice.qbStatus === "error" || Boolean(blocked)) return "needs_review";
  return "ready";
}

export function invoiceBlockedReason(input: {
  invoice: Invoice;
  job?: Job;
  lines: InvoiceLine[];
}) {
  if (input.invoice.qbStatus === "error") {
    return "QuickBooks rejected this last time. Fix the customer, job, or item, then retry.";
  }
  return invoicePushBlocked(input);
}

export function reviewableInvoices(invoices: Invoice[]) {
  return invoices.filter((invoice) => isOpenInvoice(invoice) && invoice.qbStatus !== "entered");
}

export function expenseReviewStatus(
  expense: Expense,
  blocked: string | null,
): InvoiceReviewStatus {
  if (expense.qbStatus === "queued") return "queued";
  if (expense.qbStatus === "returned") return "held";
  if (expense.qbStatus === "error" || Boolean(blocked)) return "needs_review";
  return "ready";
}

export function expenseBlockedReason(input: { expense: Expense; job?: Job | null }) {
  if (input.expense.qbStatus === "error") {
    return "QuickBooks rejected this last time. Fix the vendor, job, or account, then retry.";
  }
  return expensePushBlocked(input);
}

export function reviewableExpenses(expenses: Expense[]) {
  return expenses.filter((expense) => expense.qbStatus !== "entered");
}

export function expenseQbPayWith(method: ExpenseMethod): "credit_card" | "check" {
  return method === "credit_card" ? "credit_card" : "check";
}

export function expenseQbPreview(
  expense: Expense,
  job?: Job | null,
  customerName = "",
  accounts?: { bankAccount?: string; ccAccount?: string },
) {
  const payWith = expenseQbPayWith(expense.method);
  const hasJob = Boolean(job);
  const jobLabel = job
    ? `${customerName || "Customer"}:${job.code || job.name}`
    : expenseRequiresJob(expense.account)
      ? "Needs a job"
      : "Company overhead";
  return {
    txnType: payWith === "credit_card" ? "Credit card charge" : "Check",
    vendor: expense.vendor.trim() || "Add a vendor",
    amount: expense.amount,
    txnDate: expense.incurredAt.slice(0, 10),
    accountName: EXPENSE_ACCOUNT_LABELS[expense.account],
    paidWith: EXPENSE_METHOD_LABELS[expense.method],
    payAccount:
      payWith === "credit_card"
        ? accounts?.ccAccount?.trim() || DEFAULT_QB_CC
        : accounts?.bankAccount?.trim() || DEFAULT_QB_BANK,
    memo: expense.memo.trim() || expense.number,
    refNumber: expense.number,
    customerJob: jobLabel,
    hasJob,
  };
}

export function daysPastDue(invoice: Invoice, now = new Date()) {
  const due = daysUntil(invoice.dueAt || invoice.issuedAt);
  if (due === null) return 0;
  void now;
  return Math.max(0, -due);
}

export type AgingKey = "current" | "d1" | "d31" | "d61" | "d90";

export const AGING_LABELS: Record<AgingKey, string> = {
  current: "Current",
  d1: "1–30 days",
  d31: "31–60 days",
  d61: "61–90 days",
  d90: "90+ days",
};

export function agingBucket(pastDue: number): AgingKey {
  if (pastDue <= 0) return "current";
  if (pastDue <= 30) return "d1";
  if (pastDue <= 60) return "d31";
  if (pastDue <= 90) return "d61";
  return "d90";
}

export function arAging(input: {
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  payments: Payment[];
}) {
  const empty = { current: 0, d1: 0, d31: 0, d61: 0, d90: 0, total: 0, count: 0 };
  const next = { ...empty };
  for (const invoice of input.invoices) {
    if (!isOpenInvoice(invoice)) continue;
    const balance = invoiceBalance(invoice.id, input.invoiceLines, input.payments);
    if (balance <= 0) continue;
    const key = agingBucket(daysPastDue(invoice));
    next[key] += balance;
    next.total += balance;
    next.count += 1;
  }
  return next;
}

export function collectedThisMonth(payments: Payment[], now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  let amount = 0;
  let count = 0;
  for (const payment of payments) {
    const stamp = new Date(payment.paidAt).getTime();
    if (!Number.isFinite(stamp) || stamp < start || stamp > end) continue;
    amount += payment.amount;
    count += 1;
  }
  return { amount, count };
}

export function completedJobsWithoutInvoice(jobs: Job[], invoices: Invoice[]) {
  const billed = new Set(
    invoices.filter((invoice) => isOpenInvoice(invoice) && invoice.jobId).map((invoice) => invoice.jobId),
  );
  return jobs.filter(
    (job) =>
      (job.status === "complete" || job.status === "punch") &&
      !job.deletedAt &&
      !billed.has(job.id),
  );
}

export function expensesMissingJob(expenses: Expense[]) {
  return expenses.filter((expense) => !expense.jobId && expense.qbStatus !== "entered");
}

export function invoiceReviewAmount(invoices: Invoice[], lines: InvoiceLine[]) {
  return invoices.reduce((sum, invoice) => sum + invoiceTotal(invoice.id, lines), 0);
}

export function commissionPayout(contract: number, cost: number, plan: "gp10" | "gp50" | "rev3") {
  const amount = Math.max(0, contract);
  const jobCost = Math.max(0, cost);
  const profit = amount - jobCost;
  const payout = plan === "gp10" ? profit * 0.1 : plan === "gp50" ? profit * 0.5 : amount * 0.03;
  return {
    payout: Math.max(0, payout),
    profit,
    margin: amount > 0 ? profit / amount : 0,
  };
}

export function invoiceDueLabel(invoice: Invoice) {
  if (!invoice.dueAt) return "Due on receipt";
  const date = invoice.dueAt.slice(0, 10);
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return `Due ${date}`;
  const stamp = new Date(Number(year), Number(month) - 1, Number(day));
  return `Due ${stamp.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export function jobProfitRows(input: {
  jobs: Job[];
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  payments: Payment[];
  expenses: Expense[];
  basis: JobBooksBasis;
}) {
  return input.jobs
    .filter((job) => !job.deletedAt)
    .map((job) => {
      const books = jobProfitAndLoss({
        job,
        invoices: input.invoices,
        invoiceLines: input.invoiceLines,
        payments: input.payments,
        expenses: input.expenses,
        basis: input.basis,
      });
      return {
        id: job.id,
        name: job.name,
        salesRep: job.salesRep.trim() || "Unassigned",
        ...books,
      };
    })
    .filter((row) => row.invoiced > 0 || row.collected > 0 || row.expenses > 0)
    .sort((a, b) => b.profit - a.profit);
}

export function commissionRows(
  jobs: ReturnType<typeof jobProfitRows>,
  plan: "gp10" | "gp50" | "rev3" = "gp10",
) {
  const byRep = new Map<string, { name: string; payout: number; jobs: number; profit: number }>();
  for (const row of jobs) {
    const contract = row.contractValue > 0 ? row.contractValue : row.invoiced;
    const earned = commissionPayout(contract, row.expenses, plan);
    const current = byRep.get(row.salesRep) ?? {
      name: row.salesRep,
      payout: 0,
      jobs: 0,
      profit: 0,
    };
    current.payout += earned.payout;
    current.profit += earned.profit;
    current.jobs += 1;
    byRep.set(row.salesRep, current);
  }
  return [...byRep.values()].sort((a, b) => b.payout - a.payout);
}

export function agingInvoiceRows(input: {
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  payments: Payment[];
}) {
  const rows: Array<{
    id: string;
    number: string;
    name: string;
    balance: number;
    bucket: AgingKey;
  }> = [];
  for (const invoice of input.invoices) {
    if (!isOpenInvoice(invoice)) continue;
    const balance = invoiceBalance(invoice.id, input.invoiceLines, input.payments);
    if (balance <= 0) continue;
    rows.push({
      id: invoice.id,
      number: invoice.number,
      name: invoice.name,
      balance,
      bucket: agingBucket(daysPastDue(invoice)),
    });
  }
  return rows.sort((a, b) => b.balance - a.balance);
}

export function recentPaymentRows(payments: Payment[]) {
  return [...payments].sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}
