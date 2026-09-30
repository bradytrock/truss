import type {
  CatalogItem,
  Estimate,
  EstimateLine,
  Expense,
  ExpenseAccount,
  ForecastedExpense,
  Invoice,
  InvoiceLine,
  Job,
  Opportunity,
  Payment,
} from "@/lib/types";
import { EXPENSE_ACCOUNT_LABELS } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { invoiceTotal } from "@/lib/money";
import {
  amountForEstimate,
  includedLines,
  lineAmount,
  linesForEstimate,
  roundMoney,
} from "@/lib/estimate-totals";
import { scopedEstimateLines } from "@/lib/estimate-packages";
import { marketForEstimate } from "@/lib/market";
import type { JobBooksBasis } from "@/lib/job-financials";
import { expensesForJob, jobProfitAndLoss, paymentsForJob } from "@/lib/job-financials";
import { jobRecordHref } from "@/lib/job-record";

export const COST_OF_SALES_ACCOUNTS: ExpenseAccount[] = [
  "materials",
  "subcontractors",
  "equipment_rental",
  "dumpsters",
  "permits",
  "labor",
];

export const OPERATING_EXPENSE_ACCOUNTS: ExpenseAccount[] = ["fuel", "office", "insurance"];

export const OTHER_EXPENSE_ACCOUNTS: ExpenseAccount[] = ["other"];

export type PnlLine = {
  id: string;
  label: string;
  amount: number;
  href?: string;
  /** Invoices, payments, or vendor bills rolled into this line. Omitted when the line is already that document. */
  children?: PnlLine[];
};

export type PnlSectionId = "income" | "cos" | "expenses" | "other";

export type PnlSection = {
  id: PnlSectionId;
  label: string;
  totalLabel: string;
  emptyLine: string;
  lines: PnlLine[];
  total: number;
};

export type ProfitAndLossStatement = {
  companyName: string;
  jobName: string | null;
  periodLabel: string;
  basis: JobBooksBasis;
  income: PnlSection;
  costOfSales: PnlSection;
  expenses: PnlSection;
  otherExpenses: PnlSection;
  grossProfit: number;
  netIncome: number;
};

export type JobPnlMarginBasis = "estimate" | "average";

export type JobPnlComparison = {
  estimateId: string | null;
  estimateLabel: string | null;
  projectedIncome: number;
  projectedCostOfSales: number | null;
  projectedExpenses: number;
  projectedOther: number;
  projectedGrossProfit: number | null;
  projectedNetIncome: number | null;
  /** estimate: line costs plus forecasted expenses. average: a chosen net margin percent. */
  marginBasis: JobPnlMarginBasis;
  averageMarginPercent: number | null;
};

export function clampAverageMarginPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const rounded = Math.round(Number(value) * 100) / 100;
  return Math.min(100, Math.max(-100, rounded));
}

function inRange(ymd: string | null | undefined, from: string | null, to: string | null) {
  if (!ymd) return false;
  const day = ymd.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function rollup(id: string, label: string, children: PnlLine[], href?: string): PnlLine {
  return {
    id,
    label,
    amount: children.reduce((sum, line) => sum + line.amount, 0),
    ...(href ? { href } : {}),
    ...(children.length > 0 ? { children } : {}),
  };
}

function expenseDetailLine(expense: Expense, jobs: Job[], nameJob: boolean): PnlLine {
  const invoice = expense.invoiceNumber.trim();
  const vendor = expense.vendor.trim() || "Vendor bill";
  const job = nameJob && expense.jobId ? jobs.find((item) => item.id === expense.jobId) : undefined;
  const parts = [formatDate(expense.incurredAt)];
  if (job?.name) parts.push(job.name);
  parts.push(vendor);
  if (invoice) parts.push(`invoice ${invoice}`);
  else if (expense.number.trim()) parts.push(expense.number.trim());
  return {
    id: expense.id,
    label: parts.join(" · "),
    amount: expense.amount,
    href: expense.jobId
      ? jobRecordHref(expense.jobId, { tab: "files", doc: `expense:${expense.id}` })
      : expense.receiptUrl || undefined,
  };
}

function sumByAccount(
  expenses: Expense[],
  accounts: readonly ExpenseAccount[],
  jobs: Job[],
  nameJob: boolean,
): PnlLine[] {
  const grouped = new Map<ExpenseAccount, Expense[]>();
  for (const expense of expenses) {
    if (!accounts.includes(expense.account)) continue;
    const list = grouped.get(expense.account) ?? [];
    list.push(expense);
    grouped.set(expense.account, list);
  }
  return accounts.flatMap((account) => {
    const items = (grouped.get(account) ?? [])
      .slice()
      .sort(
        (a, b) =>
          a.incurredAt.localeCompare(b.incurredAt) ||
          a.vendor.localeCompare(b.vendor) ||
          a.id.localeCompare(b.id),
      );
    if (items.length === 0) return [];
    const line = rollup(
      account,
      EXPENSE_ACCOUNT_LABELS[account],
      items.map((expense) => expenseDetailLine(expense, jobs, nameJob)),
    );
    return line.amount === 0 ? [] : [line];
  });
}

function invoiceDetailLine(invoice: Invoice, invoiceLines: InvoiceLine[], dated: boolean): PnlLine {
  const name = invoice.name.trim();
  const core = name ? `${invoice.number} · ${name}` : invoice.number;
  return {
    id: invoice.id,
    label: dated ? `${formatDate(invoice.issuedAt)} · ${core}` : core,
    amount: invoiceTotal(invoice.id, invoiceLines),
    href: `/invoices/${invoice.id}`,
  };
}

function paymentDetailLine(payment: Payment, invoices: Invoice[], dated: boolean): PnlLine {
  const invoice = payment.invoiceId
    ? invoices.find((item) => item.id === payment.invoiceId)
    : undefined;
  const reference = payment.reference.trim();
  const head = invoice?.number ?? "Payment";
  const core = reference ? `${head} · ${payment.method} · ${reference}` : `${head} · ${payment.method}`;
  return {
    id: payment.id,
    label: dated ? `${formatDate(payment.paidAt)} · ${core}` : core,
    amount: payment.amount,
    href: invoice ? `/invoices/${invoice.id}` : undefined,
  };
}

function section(
  id: PnlSectionId,
  label: string,
  totalLabel: string,
  emptyLine: string,
  lines: PnlLine[],
): PnlSection {
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  return { id, label, totalLabel, emptyLine, lines, total };
}

function parseYmd(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0);
}

/** QuickBooks-style "January - June, 2020". */
export function formatPnlPeriod(from: string, to: string) {
  const start = parseYmd(from);
  const end = parseYmd(to);
  const startMonth = start.toLocaleDateString("en-US", { month: "long" });
  const endMonth = end.toLocaleDateString("en-US", { month: "long" });
  const year = end.getFullYear();
  if (start.getFullYear() === year && start.getMonth() === end.getMonth()) {
    return `${endMonth} ${year}`;
  }
  if (start.getFullYear() === year) {
    return `${startMonth} - ${endMonth}, ${year}`;
  }
  return `${startMonth} ${start.getFullYear()} - ${endMonth}, ${year}`;
}

export function yearToDateBounds(now = new Date()) {
  const year = now.getFullYear();
  const from = `${year}-01-01`;
  const to = [
    year,
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return { from, to, periodLabel: formatPnlPeriod(from, to) };
}

export function jobPeriodBounds(job: Job, now = new Date()) {
  const from = job.startDate.slice(0, 10) || yearToDateBounds(now).from;
  const to = yearToDateBounds(now).to;
  return { from, to, periodLabel: formatPnlPeriod(from, to) };
}

function postedInvoices(invoices: Invoice[], from: string | null, to: string | null) {
  return invoices.filter(
    (invoice) =>
      !invoice.archivedAt &&
      invoice.status !== "void" &&
      invoice.status !== "draft" &&
      inRange(invoice.issuedAt, from, to),
  );
}

function liveEstimates(estimates: Estimate[], from: string | null, to: string | null) {
  return estimates.filter((estimate) => {
    if (estimate.archivedAt) return false;
    if (estimate.status !== "sent" && estimate.status !== "viewed" && estimate.status !== "accepted") {
      return false;
    }
    return inRange(estimate.sentAt || estimate.createdAt, from, to);
  });
}

function jobIdForInvoice(
  invoice: Invoice,
  estimates: Estimate[],
  jobs: Job[],
): string | null {
  if (invoice.jobId) return invoice.jobId;
  const estimate = invoice.estimateId
    ? estimates.find((item) => item.id === invoice.estimateId)
    : undefined;
  if (estimate?.jobId) return estimate.jobId;
  if (estimate?.opportunityId) {
    return jobs.find((job) => job.opportunityId === estimate.opportunityId)?.id ?? null;
  }
  return null;
}

function billedEstimateAmount(
  estimate: Estimate,
  jobs: Job[],
  opportunities: Opportunity[],
  estimateLines: EstimateLine[],
) {
  return amountForEstimate(
    estimate,
    estimateLines,
    marketForEstimate(estimate, jobs, opportunities),
  );
}

function jobIdForEstimate(estimate: Estimate, jobs: Job[]): string | null {
  if (estimate.jobId) return estimate.jobId;
  if (estimate.opportunityId) {
    return jobs.find((job) => job.opportunityId === estimate.opportunityId)?.id ?? null;
  }
  return null;
}

function buildIncomeLines(input: {
  jobs: Job[];
  opportunities: Opportunity[];
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  payments: Payment[];
  estimates: Estimate[];
  estimateLines: EstimateLine[];
  basis: JobBooksBasis;
  jobId: string | null;
  from: string | null;
  to: string | null;
}): PnlLine[] {
  if (input.basis === "cash") {
    const payments = input.payments
      .filter((payment) => inRange(payment.paidAt, input.from, input.to))
      .slice()
      .sort((a, b) => a.paidAt.localeCompare(b.paidAt) || a.id.localeCompare(b.id));
    if (input.jobId) {
      return paymentsForJob(input.jobId, payments, input.invoices).map((payment) =>
        paymentDetailLine(payment, input.invoices, false),
      );
    }
    const byJob = new Map<string, PnlLine[]>();
    const unapplied: PnlLine[] = [];
    for (const payment of payments) {
      const invoice = payment.invoiceId
        ? input.invoices.find((item) => item.id === payment.invoiceId)
        : undefined;
      const jobId =
        payment.jobId ??
        (invoice ? jobIdForInvoice(invoice, input.estimates, input.jobs) : null);
      const detail = paymentDetailLine(payment, input.invoices, true);
      if (!jobId) {
        unapplied.push(detail);
        continue;
      }
      const list = byJob.get(jobId) ?? [];
      list.push(detail);
      byJob.set(jobId, list);
    }
    const lines: PnlLine[] = [...byJob.entries()]
      .map(([jobId, items]) => {
        const job = input.jobs.find((item) => item.id === jobId);
        return rollup(jobId, job?.name ?? "Job income", items, jobRecordHref(jobId, { tab: "financials" }));
      })
      .sort((a, b) => b.amount - a.amount);
    if (unapplied.length) {
      const line = rollup("unapplied", "Unapplied payments", unapplied);
      if (line.amount !== 0) lines.push(line);
    }
    return lines;
  }

  const invoices = postedInvoices(input.invoices, input.from, input.to);
  const invoicedByJob = new Map<string, Invoice[]>();
  const otherInvoices: Invoice[] = [];
  for (const invoice of invoices) {
    const jobId = jobIdForInvoice(invoice, input.estimates, input.jobs);
    if (input.jobId) {
      if (jobId !== input.jobId) continue;
      const list = invoicedByJob.get(input.jobId) ?? [];
      list.push(invoice);
      invoicedByJob.set(input.jobId, list);
      continue;
    }
    if (!jobId) {
      otherInvoices.push(invoice);
      continue;
    }
    const list = invoicedByJob.get(jobId) ?? [];
    list.push(invoice);
    invoicedByJob.set(jobId, list);
  }

  const invoiceLinesFor = (list: Invoice[], dated: boolean) =>
    list
      .slice()
      .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt) || a.number.localeCompare(b.number))
      .map((invoice) => invoiceDetailLine(invoice, input.invoiceLines, dated));

  if (input.jobId) {
    const billed = invoiceLinesFor(invoicedByJob.get(input.jobId) ?? [], false);
    if (billed.length) return billed;
    return liveEstimates(input.estimates, input.from, input.to)
      .filter((estimate) => jobIdForEstimate(estimate, input.jobs) === input.jobId)
      .map((estimate) => ({
        id: estimate.id,
        label: `${estimate.number} · ${estimate.name}`,
        amount: billedEstimateAmount(
          estimate,
          input.jobs,
          input.opportunities,
          input.estimateLines,
        ),
        href: `/estimates/${estimate.id}`,
      }));
  }

  const invoicedJobs = new Set(invoicedByJob.keys());
  const lines: PnlLine[] = [...invoicedByJob.entries()]
    .map(([jobId, items]) => {
      const job = input.jobs.find((item) => item.id === jobId);
      return rollup(
        jobId,
        job?.name ?? "Construction income",
        invoiceLinesFor(items, true),
        jobRecordHref(jobId, { tab: "financials" }),
      );
    })
    .sort((a, b) => b.amount - a.amount);

  const estimateByJob = new Map<string, number>();
  for (const estimate of liveEstimates(input.estimates, input.from, input.to)) {
    const jobId = jobIdForEstimate(estimate, input.jobs);
    if (!jobId || invoicedJobs.has(jobId)) continue;
    estimateByJob.set(
      jobId,
      (estimateByJob.get(jobId) ?? 0) +
        billedEstimateAmount(estimate, input.jobs, input.opportunities, input.estimateLines),
    );
  }
  for (const [jobId, amount] of estimateByJob) {
    if (!amount) continue;
    const job = input.jobs.find((item) => item.id === jobId);
    lines.push({
      id: jobId,
      label: job?.name ?? "Pipeline",
      amount,
      href: jobRecordHref(jobId, { tab: "financials" }),
    });
  }
  lines.sort((a, b) => b.amount - a.amount);
  const other = rollup("other-income", "Other income", invoiceLinesFor(otherInvoices, true));
  if (other.amount) lines.push(other);
  return lines;
}

export function estimatesForJob(
  job: Pick<Job, "id" | "opportunityId">,
  estimates: Estimate[],
) {
  return estimates.filter(
    (estimate) =>
      estimate.status !== "declined" &&
      (estimate.jobId === job.id ||
        Boolean(job.opportunityId && estimate.opportunityId === job.opportunityId)),
  );
}

export function preferredEstimateForJob(
  job: Pick<Job, "id" | "opportunityId">,
  estimates: Estimate[],
) {
  const related = estimatesForJob(job, estimates);
  return (
    related.find((estimate) => estimate.status === "accepted") ??
    related.find((estimate) => estimate.status === "sent" || estimate.status === "viewed") ??
    related.find((estimate) => estimate.status === "draft") ??
    related[0] ??
    null
  );
}

function projectedLineCost(
  line: Pick<EstimateLine, "quantity" | "unitCost" | "catalogItemId">,
  catalog: CatalogItem[],
) {
  const item = line.catalogItemId
    ? catalog.find((entry) => entry.id === line.catalogItemId)
    : undefined;
  if (item) return roundMoney(Math.max(0, item.unitCost) * line.quantity);
  return lineAmount(line);
}

/** Sold estimate (or contract value) versus the job’s books. */
export function compareJobProfitAndLoss(input: {
  job: Pick<Job, "id" | "opportunityId" | "contractValue">;
  statement: Pick<
    ProfitAndLossStatement,
    "income" | "costOfSales" | "expenses" | "otherExpenses" | "grossProfit" | "netIncome"
  >;
  estimates: Estimate[];
  estimateLines: EstimateLine[];
  catalog?: CatalogItem[];
  opportunities?: Opportunity[];
}): JobPnlComparison | null {
  const estimate = preferredEstimateForJob(input.job, input.estimates);
  const market = estimate
    ? marketForEstimate(estimate, [input.job], input.opportunities ?? [])
    : undefined;
  const projectedIncome = estimate
    ? amountForEstimate(estimate, input.estimateLines, market)
    : Math.max(0, Number(input.job.contractValue) || 0);
  if (projectedIncome <= 0 && !estimate) return null;

  const lines = estimate
    ? includedLines(scopedEstimateLines(estimate, linesForEstimate(input.estimateLines, estimate.id)))
    : [];
  const projectedCostOfSales =
    lines.length > 0
      ? roundMoney(lines.reduce((sum, line) => sum + projectedLineCost(line, input.catalog ?? []), 0))
      : null;
  const projectedExpenses = 0;
  const projectedOther = 0;
  const projectedGrossProfit =
    projectedCostOfSales == null ? null : roundMoney(projectedIncome - projectedCostOfSales);
  const projectedNetIncome =
    projectedGrossProfit == null
      ? null
      : roundMoney(projectedGrossProfit - projectedExpenses - projectedOther);

  return {
    estimateId: estimate?.id ?? null,
    estimateLabel: estimate ? `${estimate.number} · ${estimate.status}` : "Contract value",
    projectedIncome,
    projectedCostOfSales,
    projectedExpenses,
    projectedOther,
    projectedGrossProfit,
    projectedNetIncome,
    marginBasis: "estimate",
    averageMarginPercent: null,
  };
}

function forecastSum(items: ForecastedExpense[], accounts: readonly ExpenseAccount[]) {
  return roundMoney(
    items.reduce((sum, item) => (accounts.includes(item.account) ? sum + item.amount : sum), 0),
  );
}

/**
 * Fold logged forecasted expenses into the projected column.
 * Job-cost accounts join cost of sales. Fuel, office, and insurance join expenses.
 */
export function applyForecastedExpenses(
  comparison: JobPnlComparison | null,
  forecasts: ForecastedExpense[],
): JobPnlComparison | null {
  if (!comparison || forecasts.length === 0) return comparison;
  const costOfSales = forecastSum(forecasts, COST_OF_SALES_ACCOUNTS);
  const expenses = forecastSum(forecasts, OPERATING_EXPENSE_ACCOUNTS);
  const other = forecastSum(forecasts, OTHER_EXPENSE_ACCOUNTS);
  const projectedCostOfSales =
    comparison.projectedCostOfSales == null
      ? null
      : roundMoney(comparison.projectedCostOfSales + costOfSales);
  const projectedExpenses = roundMoney(comparison.projectedExpenses + expenses);
  const projectedOther = roundMoney(comparison.projectedOther + other);
  const projectedGrossProfit =
    projectedCostOfSales == null ? null : roundMoney(comparison.projectedIncome - projectedCostOfSales);
  const projectedNetIncome =
    projectedGrossProfit == null
      ? null
      : roundMoney(projectedGrossProfit - projectedExpenses - projectedOther);
  return {
    ...comparison,
    projectedCostOfSales,
    projectedExpenses,
    projectedOther,
    projectedGrossProfit,
    projectedNetIncome,
  };
}

/**
 * Replace estimate costs and forecasted expenses with a net margin percent of projected income.
 * 35 on a $10,000 job projects $3,500 of profit.
 */
export function applyAverageMargin(
  comparison: JobPnlComparison | null,
  marginPercent: number | null | undefined,
): JobPnlComparison | null {
  if (!comparison) return comparison;
  const percent = clampAverageMarginPercent(marginPercent);
  if (percent == null) return comparison;
  const projectedNetIncome = roundMoney(comparison.projectedIncome * (percent / 100));
  const projectedCostOfSales = roundMoney(comparison.projectedIncome - projectedNetIncome);
  return {
    ...comparison,
    projectedCostOfSales,
    projectedExpenses: 0,
    projectedOther: 0,
    projectedGrossProfit: projectedNetIncome,
    projectedNetIncome,
    marginBasis: "average",
    averageMarginPercent: percent,
  };
}

/** Average margin wins over forecasted expenses. A blank percent keeps the estimate projection. */
export function projectJobComparison(
  comparison: JobPnlComparison | null,
  input: {
    forecasts: ForecastedExpense[];
    averageMarginPercent?: number | null;
  },
): JobPnlComparison | null {
  if (input.averageMarginPercent != null) return applyAverageMargin(comparison, input.averageMarginPercent);
  return applyForecastedExpenses(comparison, input.forecasts);
}

/** Weighted net margin of jobs that already have income. Null when none do. */
export function averageActualMarginPercent(input: {
  jobs: Job[];
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  payments: Payment[];
  expenses: Expense[];
  basis?: JobBooksBasis;
}) {
  const basis = input.basis ?? "accrual";
  let income = 0;
  let profit = 0;
  for (const job of input.jobs) {
    if (job.deletedAt) continue;
    const books = jobProfitAndLoss({
      job,
      invoices: input.invoices,
      invoiceLines: input.invoiceLines,
      payments: input.payments,
      expenses: input.expenses,
      basis,
    });
    if (books.income <= 0) continue;
    income += books.income;
    profit += books.profit;
  }
  if (income <= 0) return null;
  return clampAverageMarginPercent((profit / income) * 100);
}

export function buildProfitAndLoss(input: {
  companyName: string;
  jobs: Job[];
  opportunities?: Opportunity[];
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  payments: Payment[];
  expenses: Expense[];
  estimates?: Estimate[];
  estimateLines?: EstimateLine[];
  basis: JobBooksBasis;
  job?: Job | null;
  from: string | null;
  to: string | null;
  periodLabel: string;
}): ProfitAndLossStatement {
  const jobId = input.job?.id ?? null;
  const estimates = input.estimates ?? [];
  const estimateLines = input.estimateLines ?? [];
  const rangedExpenses = input.expenses.filter((expense) => {
    if (!inRange(expense.incurredAt, input.from, input.to)) return false;
    if (jobId) return expense.jobId === jobId;
    return true;
  });
  const jobExpenses = jobId ? expensesForJob(jobId, rangedExpenses) : rangedExpenses;
  const incomeLines = buildIncomeLines({
    jobs: input.jobs,
    opportunities: input.opportunities ?? [],
    invoices: input.invoices,
    invoiceLines: input.invoiceLines,
    payments: input.payments,
    estimates,
    estimateLines,
    basis: input.basis,
    jobId,
    from: input.from,
    to: input.to,
  });
  const income = section(
    "income",
    "Income",
    "Total Income",
    "Construction income",
    incomeLines,
  );
  const nameJob = !jobId;
  const costOfSales = section(
    "cos",
    "Cost of Sales",
    "Total Cost of Sales",
    "Cost of sales",
    sumByAccount(jobExpenses, COST_OF_SALES_ACCOUNTS, input.jobs, nameJob),
  );
  const expenses = section(
    "expenses",
    "Expenses",
    "Total Expenses",
    "General and admin expenses",
    sumByAccount(jobExpenses, OPERATING_EXPENSE_ACCOUNTS, input.jobs, nameJob),
  );
  const otherExpenses = section(
    "other",
    "Other Expenses",
    "Total Other Expenses",
    "Other Expense",
    sumByAccount(jobExpenses, OTHER_EXPENSE_ACCOUNTS, input.jobs, nameJob),
  );
  const grossProfit = income.total - costOfSales.total;
  const netIncome = grossProfit - expenses.total - otherExpenses.total;
  return {
    companyName: input.companyName,
    jobName: input.job?.name ?? null,
    periodLabel: input.periodLabel,
    basis: input.basis,
    income,
    costOfSales,
    expenses,
    otherExpenses,
    grossProfit,
    netIncome,
  };
}
