import type {
  Estimate,
  EstimateLine,
  Expense,
  ExpenseAccount,
  Invoice,
  InvoiceLine,
  Job,
  Opportunity,
  Payment,
} from "@/lib/types";
import { EXPENSE_ACCOUNT_LABELS } from "@/lib/types";
import { invoiceTotal } from "@/lib/money";
import { amountForEstimate } from "@/lib/estimate-totals";
import { marketForEstimate } from "@/lib/market";
import type { JobBooksBasis } from "@/lib/job-financials";
import { expensesForJob, paymentsForJob } from "@/lib/job-financials";

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

function inRange(ymd: string | null | undefined, from: string | null, to: string | null) {
  if (!ymd) return false;
  const day = ymd.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function sumByAccount(expenses: Expense[], accounts: readonly ExpenseAccount[]): PnlLine[] {
  const totals = new Map<ExpenseAccount, number>();
  for (const expense of expenses) {
    if (!accounts.includes(expense.account)) continue;
    totals.set(expense.account, (totals.get(expense.account) ?? 0) + expense.amount);
  }
  return accounts
    .filter((account) => (totals.get(account) ?? 0) !== 0)
    .map((account) => ({
      id: account,
      label: EXPENSE_ACCOUNT_LABELS[account],
      amount: totals.get(account) ?? 0,
    }));
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
      invoice.status !== "void" &&
      invoice.status !== "draft" &&
      inRange(invoice.issuedAt, from, to),
  );
}

function liveEstimates(estimates: Estimate[], from: string | null, to: string | null) {
  return estimates.filter((estimate) => {
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
    const payments = input.payments.filter((payment) => inRange(payment.paidAt, input.from, input.to));
    if (input.jobId) {
      const jobPayments = paymentsForJob(input.jobId, payments, input.invoices);
      return jobPayments.map((payment) => ({
        id: payment.id,
        label: payment.reference
          ? `Payment · ${payment.method} · ${payment.reference}`
          : `Payment · ${payment.method}`,
        amount: payment.amount,
      }));
    }
    const byJob = new Map<string, number>();
    let unapplied = 0;
    for (const payment of payments) {
      const invoice = payment.invoiceId
        ? input.invoices.find((item) => item.id === payment.invoiceId)
        : undefined;
      const jobId =
        payment.jobId ??
        (invoice ? jobIdForInvoice(invoice, input.estimates, input.jobs) : null);
      if (!jobId) {
        unapplied += payment.amount;
        continue;
      }
      byJob.set(jobId, (byJob.get(jobId) ?? 0) + payment.amount);
    }
    const lines: PnlLine[] = [...byJob.entries()]
      .map(([jobId, amount]) => {
        const job = input.jobs.find((item) => item.id === jobId);
        return {
          id: jobId,
          label: job?.name ?? "Job income",
          amount,
          href: `/jobs/${jobId}?tab=financials`,
        };
      })
      .sort((a, b) => b.amount - a.amount);
    if (unapplied) {
      lines.push({ id: "unapplied", label: "Unapplied payments", amount: unapplied });
    }
    return lines;
  }

  const invoices = postedInvoices(input.invoices, input.from, input.to);
  const invoicedByJob = new Map<string, PnlLine[]>();
  const invoicedJobs = new Set<string>();
  let other = 0;
  for (const invoice of invoices) {
    const amount = invoiceTotal(invoice.id, input.invoiceLines);
    const jobId = jobIdForInvoice(invoice, input.estimates, input.jobs);
    if (input.jobId) {
      if (jobId !== input.jobId) continue;
      const list = invoicedByJob.get(input.jobId) ?? [];
      list.push({
        id: invoice.id,
        label: `${invoice.number} · ${invoice.name}`,
        amount,
        href: `/invoices/${invoice.id}`,
      });
      invoicedByJob.set(input.jobId, list);
      invoicedJobs.add(input.jobId);
      continue;
    }
    if (!jobId) {
      other += amount;
      continue;
    }
    invoicedJobs.add(jobId);
    const list = invoicedByJob.get(jobId) ?? [];
    list.push({
      id: invoice.id,
      label: invoice.name,
      amount,
      href: `/invoices/${invoice.id}`,
    });
    invoicedByJob.set(jobId, list);
  }

  if (input.jobId) {
    const billed = invoicedByJob.get(input.jobId) ?? [];
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

  const lines: PnlLine[] = [...invoicedByJob.entries()]
    .map(([jobId, items]) => {
      const job = input.jobs.find((item) => item.id === jobId);
      const amount = items.reduce((sum, item) => sum + item.amount, 0);
      return {
        id: jobId,
        label: job?.name ?? "Construction income",
        amount,
        href: `/jobs/${jobId}?tab=financials`,
      };
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
      href: `/jobs/${jobId}?tab=financials`,
    });
  }
  lines.sort((a, b) => b.amount - a.amount);
  if (other) lines.push({ id: "other-income", label: "Other income", amount: other });
  return lines;
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
  const costOfSales = section(
    "cos",
    "Cost of Sales",
    "Total Cost of Sales",
    "Cost of sales",
    sumByAccount(jobExpenses, COST_OF_SALES_ACCOUNTS),
  );
  const expenses = section(
    "expenses",
    "Expenses",
    "Total Expenses",
    "General and admin expenses",
    sumByAccount(jobExpenses, OPERATING_EXPENSE_ACCOUNTS),
  );
  const otherExpenses = section(
    "other",
    "Other Expenses",
    "Total Other Expenses",
    "Other Expense",
    sumByAccount(jobExpenses, OTHER_EXPENSE_ACCOUNTS),
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
