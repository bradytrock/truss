import { claimTotals, type JobInsurance } from "@/lib/insurance";
import { jobAddress } from "@/lib/job-record";
import { isCardMethod, isPostedPayment, paymentMethodLabel } from "@/lib/payment-posting";
import { namesMatch } from "@/lib/seats";
import type {
  Client,
  Contact,
  Expense,
  ForecastedExpense,
  Job,
  Opportunity,
  Payment,
  QbSyncStatus,
  SeatRole,
  StaffMember,
} from "@/lib/types";

/** Card receipts on the commission sheet. Matches the 4% merchant-fee line. */
export const MERCHANT_FEE_RATE = 0.04;

/** Project manager share of profit on a new closeout. */
export const PM_SPLIT_PERCENT = 50;

/** Warranty fund taken off the check, in dollars. */
export const WARRANTY_FUND = 50;

export const CLOSEOUT_STATUSES = ["submitted", "returned", "released", "payout"] as const;
export type CloseoutStatus = (typeof CLOSEOUT_STATUSES)[number];

export const CLOSEOUT_STATUS_LABELS: Record<CloseoutStatus, string> = {
  submitted: "With accounting",
  returned: "Sent back",
  released: "Ready for payout",
  payout: "Marked for payout",
};

export function closeoutPdfFilename(jobCode: string) {
  const base = jobCode.trim().replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Job";
  return `${base} closeout.pdf`;
}

export const CLOSEOUT_REVIEW_TASK = "Review closeout";
/** Task assigned to the project manager when accounting releases a closeout. */
export const CLOSEOUT_PAYOUT_TASK = "Ready for review";
/** Earlier payout tasks used this title. Still closed when the check is marked. */
export const LEGACY_CLOSEOUT_PAYOUT_TASK = "Commission payout";

export type ExpenseDisposition = "job" | "pm_deduction" | "customer_refund";

/** An expense accounting pulled off the job cost: a project-manager deduction, or a customer refund. */
export interface ExpenseAdjustment {
  expenseId: string;
  disposition: Exclude<ExpenseDisposition, "job">;
  /** Deduction taken off the project manager’s check. Null uses the expense amount. */
  amount: number | null;
}

export interface CommissionQbLine {
  id: string;
  vendor: string;
  amount: number;
  txnId: string;
  invoiceNumber: string;
  incurredAt: string;
  /** CRM expense this QuickBooks row was tied to, when there is one. */
  expenseId: string | null;
}

export interface CommissionSplitLine {
  id: string;
  label: string;
  /** Percent of profit. Null means this line uses `flat` instead. */
  percent: number | null;
  flat: number;
  trades: number;
  draw: number;
}

export interface CommissionCloseout {
  id: string;
  jobId: string;
  status: CloseoutStatus;
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  accountingNote: string;
  reviewedBy: string;
  reviewedByName: string;
  reviewedAt: string | null;
  releasedToStaffId: string;
  releasedToName: string;
  payoutMarkedBy: string;
  payoutMarkedByName: string;
  payoutMarkedAt: string | null;
  qbLines: CommissionQbLine[];
  splits: CommissionSplitLine[];
  varianceAck: boolean;
  notes: string;
  expenseAdjustments: ExpenseAdjustment[];
  updatedAt: string;
}

export type ExpenseCompareStatus = "match" | "amount" | "crm_only" | "qb_only" | "not_posted";

export const COMPARE_STATUS_LABELS: Record<ExpenseCompareStatus, string> = {
  match: "In both",
  amount: "Amount differs",
  crm_only: "Missing in QuickBooks",
  qb_only: "QuickBooks only",
  not_posted: "Not in QuickBooks",
};

export interface ExpenseCompareRow {
  key: string;
  vendor: string;
  crm: {
    id: string;
    number: string;
    amount: number;
    invoiceNumber: string;
    qbStatus: QbSyncStatus;
    txnId: string;
  } | null;
  qb: {
    id: string;
    amount: number;
    txnId: string;
    invoiceNumber: string;
  } | null;
  status: ExpenseCompareStatus;
}

export interface CommissionScopeRow {
  label: string;
  isow: number;
  tsow: number;
  zsow: number;
  /** (TSOW − ISOW) / ISOW. Null when insurance scope is zero — the sheet’s #DIV/0!. */
  difference: number | null;
}

export interface CommissionSplitComputed extends CommissionSplitLine {
  comm: number;
  check: number;
}

export interface CommissionSheet {
  customerName: string;
  projectAddress: string;
  projectManager: string;
  phone: string;
  email: string;
  closingDate: string | null;
  jobCode: string;
  lead: string;
  payments: Array<{ label: string; amount: number; method: string; ccFee: number }>;
  hiddenPayments: number;
  paymentsReceived: number;
  merchantFees: number;
  customerRefund: number;
  /** Payment refunds and expenses accounting flipped into the income section. */
  refundLines: Array<{ id: string; label: string; amount: number }>;
  totalPayments: number;
  jobSold: number;
  scopes: CommissionScopeRow[];
  scopeTotals: { isow: number; tsow: number; zsow: number; difference: number | null };
  carrier: string;
  overheadProfit: number;
  rcv: number;
  zsow: number;
  due: number;
  estProfit: number | null;
  actualProfit: number;
  profitDifference: number | null;
  expenseLines: Array<{
    id: string;
    vendor: string;
    amount: number;
    forecasted: boolean;
    disposition: ExpenseDisposition;
  }>;
  totalExpenses: number;
  /** Job expenses moved onto the project manager’s check. */
  pmDeductions: Array<{ expenseId: string; vendor: string; amount: number }>;
  profit: number;
  /** Profit / job sold. Null when the job sold amount is zero. */
  margin: number | null;
  costBasis: "actual" | "forecasted" | "mixed" | "none";
  expensesAreForecasted: boolean;
  validationOnly: boolean;
  splits: CommissionSplitComputed[];
  splitTotals: { percent: number | null; comm: number; trades: number; draw: number; check: number };
  compare: ExpenseCompareRow[];
  needsAck: boolean;
}

function cents(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function num(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function sameMoney(a: number, b: number) {
  return Math.abs(a - b) < 0.005;
}

function normalizeVendor(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseCloseoutStatus(value: string | null | undefined): CloseoutStatus {
  if (value === "returned" || value === "released" || value === "payout" || value === "submitted") return value;
  return "submitted";
}

export function defaultCommissionSplits(): CommissionSplitLine[] {
  return [
    { id: "pm", label: "Project manager", percent: PM_SPLIT_PERCENT, flat: 0, trades: 0, draw: 0 },
    { id: "advertising", label: "Advertising", percent: null, flat: 0, trades: 0, draw: 0 },
    { id: "other", label: "Other", percent: null, flat: 0, trades: 0, draw: 0 },
    { id: "truck", label: "Truck loan", percent: null, flat: 0, trades: 0, draw: 0 },
    { id: "warranty", label: "Warranty fund", percent: null, flat: 0, trades: WARRANTY_FUND, draw: 0 },
    { id: "draw", label: "Draw", percent: null, flat: 0, trades: 0, draw: 0 },
  ];
}

export function parseQbLines(value: unknown): CommissionQbLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = text(row.id).trim();
    if (!id) return [];
    const expenseId = text(row.expenseId).trim();
    return [
      {
        id,
        vendor: text(row.vendor),
        amount: cents(num(row.amount)),
        txnId: text(row.txnId),
        invoiceNumber: text(row.invoiceNumber),
        incurredAt: text(row.incurredAt),
        expenseId: expenseId || null,
      },
    ];
  });
}

export function parseSplits(value: unknown): CommissionSplitLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = text(row.id).trim();
    if (!id) return [];
    const percentRaw = row.percent;
    const percent =
      percentRaw == null || percentRaw === ""
        ? null
        : Number.isFinite(Number(percentRaw))
          ? num(percentRaw)
          : null;
    return [
      {
        id,
        label: text(row.label) || "Payee",
        percent,
        flat: cents(num(row.flat)),
        trades: cents(num(row.trades)),
        draw: cents(num(row.draw)),
      },
    ];
  });
}

export function parseExpenseAdjustments(value: unknown): ExpenseAdjustment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const expenseId = text(row.expenseId).trim();
    const disposition = row.disposition === "pm_deduction" || row.disposition === "customer_refund" ? row.disposition : null;
    if (!expenseId || !disposition) return [];
    const amountRaw = row.amount;
    const amount =
      amountRaw == null || amountRaw === ""
        ? null
        : Number.isFinite(Number(amountRaw))
          ? cents(Math.max(0, num(amountRaw)))
          : null;
    return [{ expenseId, disposition, amount }];
  });
}

/**
 * Money typed into a commission deduction. A trailing decimal stays valid so "12."
 * can continue into "12.50". Returns null when the draft is not a money amount.
 */
export function parseMoneyDraft(raw: string): number | null {
  const value = raw.trim();
  if (value === "") return 0;
  if (!/^\d*\.?\d{0,2}$/.test(value)) return null;
  if (value === ".") return 0;
  const amount = Number(value.endsWith(".") ? value.slice(0, -1) : value);
  return Number.isFinite(amount) ? cents(Math.max(0, amount)) : null;
}

export function applyExpenseDisposition(
  current: ExpenseAdjustment[],
  expenseId: string,
  disposition: ExpenseDisposition,
  expenseAmount: number,
): ExpenseAdjustment[] {
  const rest = current.filter((item) => item.expenseId !== expenseId);
  if (disposition === "job") return rest;
  const previous = current.find((item) => item.expenseId === expenseId);
  return [
    ...rest,
    {
      expenseId,
      disposition,
      amount:
        disposition === "pm_deduction"
          ? previous?.disposition === "pm_deduction" && previous.amount != null
            ? cents(previous.amount)
            : cents(Math.max(0, expenseAmount))
          : null,
    },
  ];
}

export function setDeductionAmount(current: ExpenseAdjustment[], expenseId: string, amount: number): ExpenseAdjustment[] {
  return current.map((item) =>
    item.expenseId === expenseId && item.disposition === "pm_deduction"
      ? { ...item, amount: cents(Math.max(0, amount)) }
      : item,
  );
}

export function seedQuickbooksLines(expenses: Expense[]): CommissionQbLine[] {
  return expenses
    .filter((expense) => expense.qbStatus === "entered")
    .map((expense) => ({
      id: `qb-${expense.id}`,
      vendor: expense.vendor,
      amount: cents(expense.amount),
      txnId: expense.qbTxnId ?? "",
      invoiceNumber: expense.invoiceNumber,
      incurredAt: expense.incurredAt.slice(0, 10),
      expenseId: expense.id,
    }));
}

export function mergePostedBills(current: CommissionQbLine[], expenses: Expense[]): CommissionQbLine[] {
  const covered = new Set(current.map((line) => line.expenseId).filter((id): id is string => Boolean(id)));
  const additions = seedQuickbooksLines(expenses).filter((line) => line.expenseId && !covered.has(line.expenseId));
  return additions.length ? [...current, ...additions] : current;
}

export function blankQbLine(id: string): CommissionQbLine {
  return {
    id,
    vendor: "",
    amount: 0,
    txnId: "",
    invoiceNumber: "",
    incurredAt: "",
    expenseId: null,
  };
}

export function blankSplitLine(id: string): CommissionSplitLine {
  return { id, label: "Payee", percent: null, flat: 0, trades: 0, draw: 0 };
}

function scopeDifference(isow: number, tsow: number) {
  if (Math.abs(isow) < 0.005) return null;
  return (tsow - isow) / isow;
}

function isRefund(payment: Payment) {
  return payment.amount < 0 || /refund/i.test(payment.method);
}

export function compareJobExpenses(expenses: Expense[], qbLines: CommissionQbLine[]): ExpenseCompareRow[] {
  const used = new Set<string>();
  const rows: ExpenseCompareRow[] = [];

  for (const expense of expenses) {
    const open = qbLines.filter((line) => !used.has(line.id));
    let line = open.find((item) => item.expenseId === expense.id) ?? null;
    if (!line && expense.invoiceNumber.trim()) {
      const invoice = expense.invoiceNumber.trim().toLowerCase();
      const hits = open.filter((item) => item.invoiceNumber.trim().toLowerCase() === invoice);
      if (hits.length === 1) line = hits[0] ?? null;
    }
    if (!line) {
      const vendor = normalizeVendor(expense.vendor);
      const hits = open.filter(
        (item) => normalizeVendor(item.vendor) === vendor && sameMoney(item.amount, expense.amount),
      );
      if (hits.length === 1) line = hits[0] ?? null;
    }
    if (line) used.add(line.id);
    const status: ExpenseCompareStatus = !line
      ? expense.qbStatus === "entered"
        ? "crm_only"
        : "not_posted"
      : sameMoney(expense.amount, line.amount)
        ? "match"
        : "amount";
    rows.push({
      key: expense.id,
      vendor: expense.vendor || line?.vendor || "Expense",
      crm: {
        id: expense.id,
        number: expense.number,
        amount: cents(expense.amount),
        invoiceNumber: expense.invoiceNumber,
        qbStatus: expense.qbStatus,
        txnId: expense.qbTxnId ?? "",
      },
      qb: line
        ? {
            id: line.id,
            amount: cents(line.amount),
            txnId: line.txnId,
            invoiceNumber: line.invoiceNumber,
          }
        : null,
      status,
    });
  }

  for (const line of qbLines) {
    if (used.has(line.id)) continue;
    rows.push({
      key: line.id,
      vendor: line.vendor || "QuickBooks bill",
      crm: null,
      qb: {
        id: line.id,
        amount: cents(line.amount),
        txnId: line.txnId,
        invoiceNumber: line.invoiceNumber,
      },
      status: "qb_only",
    });
  }

  return rows;
}

function computeSplits(lines: CommissionSplitLine[], profit: number, pmDeductions = 0): CommissionSplitComputed[] {
  const computed = lines.map((line) => {
    const comm = line.percent == null ? cents(line.flat) : cents(profit * (line.percent / 100));
    return {
      ...line,
      flat: cents(line.flat),
      trades: cents(line.trades),
      draw: cents(line.draw),
      comm,
      check: cents(comm - line.trades - line.draw),
    };
  });
  const pmIndex = computed.findIndex((line) => line.id === "pm");
  if (pmIndex < 0) return computed;
  const taken = computed.reduce((sum, line, index) => {
    if (index === pmIndex || line.check <= 0) return sum;
    return sum + line.check;
  }, 0);
  const pm = computed[pmIndex];
  const next = computed.slice();
  next[pmIndex] = { ...pm, check: cents(pm.check - taken - Math.max(0, pmDeductions)) };
  return next;
}

export function buildCommissionSheet(input: {
  job: Job;
  client?: Client | null;
  contact?: Contact | null;
  opportunity?: Opportunity | null;
  claim?: JobInsurance | null;
  payments: Payment[];
  expenses: Expense[];
  forecasts: ForecastedExpense[];
  qbLines?: CommissionQbLine[] | null;
  splits?: CommissionSplitLine[] | null;
  expenseAdjustments?: ExpenseAdjustment[] | null;
  closingDate?: string | null;
}): CommissionSheet {
  const adjustments = input.expenseAdjustments ?? [];
  const dispositionOf = (id: string): ExpenseDisposition =>
    adjustments.find((item) => item.expenseId === id)?.disposition ?? "job";
  const posted = input.payments.filter(isPostedPayment);
  const refunds = posted.filter(isRefund);
  const receipts = posted.filter((payment) => !isRefund(payment)).sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  const paymentsReceived = cents(receipts.reduce((sum, payment) => sum + payment.amount, 0));
  const merchantFees = cents(
    receipts.reduce((sum, payment) => sum + (isCardMethod(payment.method) ? payment.amount * MERCHANT_FEE_RATE : 0), 0),
  );
  const refundExpenses = input.expenses.filter((expense) => dispositionOf(expense.id) === "customer_refund");
  const refundLines = [
    ...refunds.map((payment) => ({
      id: payment.id,
      label: payment.reference.trim() || "Refund",
      amount: cents(Math.abs(payment.amount)),
    })),
    ...refundExpenses.map((expense) => ({
      id: expense.id,
      label: expense.vendor.trim() || "Customer refund",
      amount: cents(Math.abs(expense.amount)),
    })),
  ];
  const customerRefund = cents(refundLines.reduce((sum, line) => sum + line.amount, 0));
  const deductionExpenses = input.expenses.filter((expense) => dispositionOf(expense.id) === "pm_deduction");
  const pmDeductions = deductionExpenses.map((expense) => {
    const adjustment = adjustments.find((item) => item.expenseId === expense.id);
    const amount = adjustment?.amount != null ? adjustment.amount : Math.abs(expense.amount);
    return {
      expenseId: expense.id,
      vendor: expense.vendor.trim() || "Expense",
      amount: cents(Math.max(0, amount)),
    };
  });
  const pmDeductionTotal = cents(pmDeductions.reduce((sum, line) => sum + line.amount, 0));
  const totalPayments = cents(paymentsReceived - merchantFees - customerRefund);
  const jobSold = cents(Math.max(0, input.job.contractValue));

  const claim = input.claim;
  const totals = claim ? claimTotals(claim) : null;
  const isowDwelling = cents(totals?.rcvWithSupplements ?? 0);
  const deductible = cents(claim?.deductible ?? 0);
  const tsowDwelling = jobSold;
  const zsowDwelling = claim ? cents(Math.max(0, (totals?.netClaim ?? 0))) : jobSold;
  const dwelling: CommissionScopeRow = {
    label: "Dwelling",
    isow: isowDwelling,
    tsow: tsowDwelling,
    zsow: zsowDwelling,
    difference: scopeDifference(isowDwelling, tsowDwelling),
  };
  const other: CommissionScopeRow = {
    label: "Other",
    isow: 0,
    tsow: 0,
    zsow: 0,
    difference: scopeDifference(0, 0),
  };
  const contents: CommissionScopeRow = {
    label: "Contents",
    isow: 0,
    tsow: 0,
    zsow: 0,
    difference: scopeDifference(0, 0),
  };
  const deductibleRow: CommissionScopeRow = {
    label: "Deductible",
    isow: deductible,
    tsow: deductible,
    zsow: deductible,
    difference: scopeDifference(deductible, deductible),
  };
  const scopeIsow = cents(dwelling.isow + other.isow + contents.isow);
  const scopeTsow = cents(dwelling.tsow + other.tsow + contents.tsow);
  const scopeZsow = cents(dwelling.zsow + other.zsow + contents.zsow);

  const actualLines = input.expenses.map((expense) => ({
    id: expense.id,
    vendor: expense.vendor || "Vendor",
    amount: cents(expense.amount),
    forecasted: false,
    disposition: dispositionOf(expense.id),
  }));
  const forecastLines = input.forecasts.map((forecast) => ({
    id: forecast.id,
    vendor: forecast.vendor || "Forecast",
    amount: cents(forecast.amount),
    forecasted: true,
    disposition: "job" as const,
  }));
  const countedActual = actualLines.filter((line) => line.disposition === "job");
  const reclassified = actualLines.filter((line) => line.disposition !== "job");
  const actualTotal = cents(countedActual.reduce((sum, line) => sum + line.amount, 0));
  const forecastTotal = cents(forecastLines.reduce((sum, line) => sum + line.amount, 0));
  const costBasis: CommissionSheet["costBasis"] =
    countedActual.length && forecastLines.length
      ? "mixed"
      : countedActual.length
        ? "actual"
        : forecastLines.length
          ? "forecasted"
          : "none";
  const expenseLines =
    costBasis === "forecasted"
      ? [...reclassified, ...forecastLines]
      : costBasis === "mixed"
        ? [...actualLines, ...forecastLines]
        : actualLines;
  const totalExpenses = costBasis === "forecasted" ? forecastTotal : actualTotal;
  const profit = cents(totalPayments - totalExpenses);
  const margin = jobSold > 0 ? profit / jobSold : null;
  const estProfit = forecastLines.length ? cents(jobSold - forecastTotal) : null;
  const actualProfit = cents(totalPayments - actualTotal);
  const profitDifference = estProfit == null ? null : cents(actualProfit - estProfit);

  const jobExpenses = input.expenses.filter((expense) => dispositionOf(expense.id) === "job");
  const qbLines = (input.qbLines ?? seedQuickbooksLines(jobExpenses)).filter(
    (line) => !line.expenseId || dispositionOf(line.expenseId) === "job",
  );
  const compare = compareJobExpenses(jobExpenses, qbLines);
  const openVariance = compare.some((row) => row.status !== "match");
  const expensesAreForecasted = costBasis === "forecasted";
  const needsAck = costBasis !== "actual" || openVariance;
  const validationOnly = needsAck;
  const splits = computeSplits(input.splits?.length ? input.splits : defaultCommissionSplits(), profit, pmDeductionTotal);
  const pmSplit = splits.find((line) => line.id === "pm");
  const percentLines = splits.filter((line) => line.percent != null);
  const shown = receipts.slice(0, 6);

  return {
    customerName: input.contact?.name?.trim() || input.client?.name?.trim() || input.job.name,
    projectAddress: jobAddress(input.job),
    projectManager: input.job.projectManager.trim(),
    phone: input.contact?.phone?.trim() ?? "",
    email: input.contact?.email?.trim() ?? "",
    closingDate: input.closingDate ?? input.job.substantialCompletion,
    jobCode: input.job.code,
    lead: input.job.salesRep.trim() || input.opportunity?.estimator?.trim() || "",
    payments: shown.map((payment, index) => ({
      label: `${index + 1}${index === 0 ? "st" : index === 1 ? "nd" : index === 2 ? "rd" : "th"} payment`,
      amount: cents(payment.amount),
      method: paymentMethodLabel(payment.method),
      ccFee: isCardMethod(payment.method) ? cents(payment.amount * MERCHANT_FEE_RATE) : 0,
    })),
    hiddenPayments: Math.max(0, receipts.length - shown.length),
    paymentsReceived,
    merchantFees,
    customerRefund,
    refundLines,
    totalPayments,
    jobSold,
    scopes: [dwelling, other, contents, deductibleRow],
    scopeTotals: {
      isow: scopeIsow,
      tsow: scopeTsow,
      zsow: scopeZsow,
      difference: scopeDifference(scopeIsow, scopeTsow),
    },
    carrier: claim?.carrier?.trim() ?? "",
    overheadProfit: cents(claim?.overheadProfit ?? 0),
    rcv: cents(totals?.rcvWithSupplements ?? claim?.rcv ?? 0),
    zsow: scopeZsow,
    due: cents(scopeZsow - totalPayments),
    estProfit,
    actualProfit,
    profitDifference,
    expenseLines,
    totalExpenses,
    pmDeductions,
    profit,
    margin,
    costBasis,
    expensesAreForecasted,
    validationOnly,
    splits,
    splitTotals: {
      percent: pmSplit
        ? pmSplit.percent
        : percentLines.length
          ? percentLines.reduce((sum, line) => sum + (line.percent ?? 0), 0)
          : null,
      comm: cents(pmSplit ? pmSplit.comm : splits.reduce((sum, line) => sum + line.comm, 0)),
      trades: cents(splits.reduce((sum, line) => sum + line.trades, 0)),
      draw: cents(splits.reduce((sum, line) => sum + line.draw, 0)),
      check: cents(splits.reduce((sum, line) => sum + line.check, 0)),
    },
    compare,
    needsAck,
  };
}

export function closeoutReleaseBlock(sheet: CommissionSheet, acknowledged: boolean) {
  if (!sheet.needsAck || acknowledged) return null;
  const reclassified = sheet.expenseLines.some((line) => !line.forecasted && line.disposition !== "job");
  if (sheet.costBasis === "forecasted") {
    return "Every cost on this job is still a forecast. Acknowledge that before releasing payout.";
  }
  if (sheet.costBasis === "mixed") {
    return "Some costs are still forecasted. Acknowledge that before releasing payout.";
  }
  if (sheet.costBasis === "none") {
    if (reclassified && sheet.compare.every((row) => row.status === "match")) return null;
    return "This job has no expenses yet. Acknowledge that before releasing payout.";
  }
  return "QuickBooks and the CRM expenses still differ. Match them, or acknowledge the difference, before releasing payout.";
}

/** Lines on a closeout that belong to this person: the project-manager line when they run the job, a payee labeled with their name, or the sheet accounting released to them. */
export function splitsForViewer(input: {
  splits: CommissionSplitComputed[];
  viewerName: string;
  viewerStaffId?: string;
  projectManager?: string;
  ownerStaffId?: string | null;
  releasedToStaffId?: string;
  releasedToName?: string;
}) {
  const name = input.viewerName.trim();
  const manager = input.projectManager?.trim() ?? "";
  const isManager =
    Boolean(input.viewerStaffId && input.ownerStaffId && input.viewerStaffId === input.ownerStaffId) ||
    (name.length > 0 && manager.length > 0 && namesMatch(name, manager));
  const matched = input.splits.filter((line) => {
    if (line.id === "pm") return isManager;
    const label = line.label.trim();
    return name.length > 0 && label.length > 0 && namesMatch(label, name);
  });
  if (matched.length > 0) return matched;
  const releasedName = input.releasedToName?.trim() ?? "";
  const released =
    Boolean(input.viewerStaffId && input.releasedToStaffId && input.viewerStaffId === input.releasedToStaffId) ||
    (name.length > 0 && releasedName.length > 0 && namesMatch(name, releasedName));
  if (!released) return [];
  const pm = input.splits.find((line) => line.id === "pm");
  return pm ? [pm] : [];
}

export function viewerCommissionCheck(input: Parameters<typeof splitsForViewer>[0]) {
  return cents(splitsForViewer(input).reduce((sum, line) => sum + line.check, 0));
}

export function isCommissionInYear(iso: string | null | undefined, year: number) {
  if (!iso) return false;
  const time = new Date(iso);
  return !Number.isNaN(time.getTime()) && time.getFullYear() === year;
}

export function canSubmitProjectCloseout(input: {
  role?: SeatRole;
  title?: string;
  viewerName: string;
  viewerStaffId?: string;
  projectManager?: string;
  ownerStaffId?: string | null;
}) {
  if (
    input.role === "project_manager" ||
    input.role === "company_admin" ||
    input.role === "team_lead" ||
    input.role === "superintendent" ||
    /project manager/i.test(input.title ?? "")
  ) {
    return true;
  }
  if (input.viewerStaffId && input.ownerStaffId && input.viewerStaffId === input.ownerStaffId) return true;
  const manager = input.projectManager?.trim() ?? "";
  return manager.length > 0 && namesMatch(input.viewerName, manager);
}

export function canReviewCloseout(role: SeatRole | undefined) {
  return role === "accountant" || role === "company_admin";
}

export function canMarkCommissionPayout(input: {
  closeout: CommissionCloseout;
  viewerStaffId: string;
  viewerName: string;
  viewerRole: SeatRole | undefined;
}) {
  if (input.closeout.status !== "released") return false;
  if (input.viewerRole === "company_admin") return true;
  if (input.closeout.releasedToStaffId && input.closeout.releasedToStaffId === input.viewerStaffId) return true;
  const named = input.closeout.releasedToName.trim().toLowerCase();
  return named.length > 0 && named === input.viewerName.trim().toLowerCase();
}

export function payoutRecipients(staff: StaffMember[], projectManager: string, ownerStaffId?: string | null) {
  const named = projectManager.trim();
  return staff.filter((member) => {
    if (member.locked || member.restricted) return false;
    if (member.role === "project_manager" || member.role === "team_lead" || member.role === "company_admin") {
      return true;
    }
    if (ownerStaffId && member.id === ownerStaffId) return true;
    return named.length > 0 && namesMatch(member.name, named);
  });
}

export function closeoutTaskTitle(kind: "review" | "payout", jobCode: string) {
  const code = jobCode.trim() || "job";
  return kind === "review" ? `${CLOSEOUT_REVIEW_TASK} ${code}` : `${CLOSEOUT_PAYOUT_TASK} ${code}`;
}

export function isPayoutReviewTask(title: string) {
  return title.startsWith(CLOSEOUT_PAYOUT_TASK) || title.startsWith(LEGACY_CLOSEOUT_PAYOUT_TASK);
}

export function isCloseoutTaskTitle(title: string) {
  return title.startsWith(CLOSEOUT_REVIEW_TASK) || isPayoutReviewTask(title);
}

/** Status the project manager sees on Commissions. A released closeout is waiting on their review. */
export function pmCloseoutStatusLabel(status: CloseoutStatus) {
  if (status === "released") return "Ready for Review";
  return CLOSEOUT_STATUS_LABELS[status];
}

export function newCommissionCloseout(input: {
  id: string;
  jobId: string;
  submittedBy: string;
  submittedByName: string;
  expenses: Expense[];
  now: string;
  notes: string;
  previous?: CommissionCloseout | null;
}): CommissionCloseout {
  const previous = input.previous;
  return {
    id: previous?.id || input.id,
    jobId: input.jobId,
    status: "submitted",
    submittedBy: input.submittedBy,
    submittedByName: input.submittedByName,
    submittedAt: input.now,
    accountingNote: "",
    reviewedBy: "",
    reviewedByName: "",
    reviewedAt: null,
    releasedToStaffId: "",
    releasedToName: "",
    payoutMarkedBy: "",
    payoutMarkedByName: "",
    payoutMarkedAt: null,
    qbLines: seedQuickbooksLines(input.expenses),
    splits: previous?.splits?.length ? previous.splits : defaultCommissionSplits(),
    varianceAck: false,
    notes: input.notes.trim(),
    expenseAdjustments: previous?.expenseAdjustments ?? [],
    updatedAt: input.now,
  };
}

export function commissionCloseoutPayload(row: CommissionCloseout, companyId: string) {
  return {
    id: row.id,
    company_id: companyId,
    job_id: row.jobId,
    status: row.status,
    submitted_by: row.submittedBy,
    submitted_by_name: row.submittedByName,
    submitted_at: row.submittedAt,
    accounting_note: row.accountingNote,
    reviewed_by: row.reviewedBy,
    reviewed_by_name: row.reviewedByName,
    reviewed_at: row.reviewedAt,
    released_to_staff_id: row.releasedToStaffId,
    released_to_name: row.releasedToName,
    payout_marked_by: row.payoutMarkedBy,
    payout_marked_by_name: row.payoutMarkedByName,
    payout_marked_at: row.payoutMarkedAt,
    qb_lines: row.qbLines,
    splits: row.splits,
    variance_ack: row.varianceAck,
    notes: row.notes,
    expense_adjustments: row.expenseAdjustments,
    updated_at: row.updatedAt,
  };
}
