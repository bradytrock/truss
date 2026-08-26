import { resolveCustomerName } from "@/lib/parties";
import type {
  Client,
  Contact,
  Expense,
  ExpenseAccount,
  Invoice,
  InvoiceLine,
  Job,
  Opportunity,
  Payment,
} from "@/lib/types";
import { EXPENSE_ACCOUNT_LABELS } from "@/lib/types";
import { customerAliasName, customerJobFullName, qbName, type QbInvoiceLine } from "@/lib/qbwc/qbxml";

export const DEFAULT_QB_ITEM = "Contract work";
export const DEFAULT_QB_BANK = "Checking";
export const DEFAULT_QB_CC = "Credit Card";

export type QbwcStep =
  | "customer_query"
  | "customer_add"
  | "customer_alias_query"
  | "customer_alias_add"
  | "job_query"
  | "job_add"
  | "item_query"
  | "item_add"
  | "invoice_add"
  | "vendor_query"
  | "vendor_add"
  | "expense_add"
  | "payment_add";

/** Session step may carry `+alias` so later requests hang the job under `Name Cust` without extra SQL. */
export const QBWC_ALIAS_FLAG = "+alias";

export function splitQbwcStep(raw: string): { step: QbwcStep; useAlias: boolean } {
  const useAlias = raw.endsWith(QBWC_ALIAS_FLAG);
  const step = (useAlias ? raw.slice(0, -QBWC_ALIAS_FLAG.length) : raw) as QbwcStep;
  return { step, useAlias };
}

export function taggedQbwcStep(step: QbwcStep, useAlias: boolean) {
  if (!useAlias) return step;
  if (
    step === "customer_query" ||
    step === "customer_add" ||
    step === "customer_alias_query" ||
    step === "customer_alias_add" ||
    step === "vendor_query" ||
    step === "vendor_add"
  ) {
    return step;
  }
  return `${step}${QBWC_ALIAS_FLAG}`;
}

export type QbInvoiceWork = {
  kind: "invoice";
  invoiceId: string;
  number: string;
  name: string;
  issuedAt: string;
  dueAt: string | null;
  notes: string;
  customerName: string;
  jobCode: string;
  jobName: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  itemName: string;
  lines: QbInvoiceLine[];
  customerListId?: string;
  jobListId?: string;
};

export type QbExpenseWork = {
  kind: "expense";
  expenseId: string;
  number: string;
  vendor: string;
  accountName: string;
  amount: number;
  payWith: "credit_card" | "check";
  txnDate: string;
  memo: string;
  payAccount: string;
  customerName: string;
  jobCode: string;
  jobName: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  hasJob: boolean;
  customerListId?: string;
  jobListId?: string;
};

export type QbPaymentWork = {
  kind: "payment";
  paymentId: string;
  amount: number;
  txnDate: string;
  reference: string;
  memo: string;
  customerName: string;
  jobCode: string;
  jobName: string;
  invoiceNumber: string;
  invoiceTxnId: string;
  depositAccount: string;
  hasJob: boolean;
  customerListId?: string;
  jobListId?: string;
};

export type QbwcWork = QbInvoiceWork | QbExpenseWork | QbPaymentWork;

export function invoicePushBlocked(input: {
  invoice: Invoice;
  job?: Job;
  lines: InvoiceLine[];
}): string | null {
  if (input.invoice.status === "draft") return "Still a draft — send it before QuickBooks.";
  if (input.invoice.status === "void") return "Voided invoices stay out of QuickBooks.";
  if (!input.job) return "Assign this invoice to a job so QuickBooks can hang it on Customer:Job.";
  if (input.lines.length === 0) return "Add line items first. The connector will not guess amounts.";
  return null;
}

export function invoiceReadyReason(input: {
  invoice: Invoice;
  job?: Job;
  lines: InvoiceLine[];
}): string | null {
  if (input.invoice.qbStatus === "entered") return "Already entered in QuickBooks.";
  if (input.invoice.qbStatus === "error") {
    return "QuickBooks rejected this last time. Retry after you fix the customer, job, or item name.";
  }
  return invoicePushBlocked(input);
}

export function workFromInvoice(input: {
  invoice: Invoice;
  job: Job;
  lines: InvoiceLine[];
  customerName: string;
  phone?: string;
  itemName?: string;
}): QbInvoiceWork {
  const lines = [...input.lines]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((line) => ({
      description: line.description.trim() || input.invoice.name,
      quantity: line.quantity,
      unit: line.unit,
      unitCost: line.unitCost,
    }));
  return {
    kind: "invoice",
    invoiceId: input.invoice.id,
    number: input.invoice.number,
    name: input.invoice.name,
    issuedAt: input.invoice.issuedAt,
    dueAt: input.invoice.dueAt,
    notes: input.invoice.notes,
    customerName: input.customerName.trim() || "Homeowner",
    jobCode: input.job.code.trim() || input.job.name,
    jobName: input.job.name,
    street: input.job.street,
    city: input.job.city,
    state: input.job.state,
    postalCode: input.job.postalCode,
    phone: input.phone ?? "",
    itemName: qbName(input.itemName?.trim() || DEFAULT_QB_ITEM),
    lines,
  };
}

export function workFromBook(input: {
  invoice: Invoice;
  job?: Job;
  lines: InvoiceLine[];
  contacts: Contact[];
  clients: Client[];
  opportunities: Opportunity[];
  itemName?: string;
}): { work: QbInvoiceWork; blocked: string | null } {
  const blocked = invoiceReadyReason({
    invoice: input.invoice,
    job: input.job,
    lines: input.lines,
  });
  if (blocked || !input.job) {
    return {
      blocked: blocked || "Assign this invoice to a job so QuickBooks can hang it on Customer:Job.",
      work: {
        kind: "invoice",
        invoiceId: input.invoice.id,
        number: input.invoice.number,
        name: input.invoice.name,
        issuedAt: input.invoice.issuedAt,
        dueAt: input.invoice.dueAt,
        notes: input.invoice.notes,
        customerName: "Homeowner",
        jobCode: "",
        jobName: "",
        street: "",
        city: "",
        state: "",
        postalCode: "",
        phone: "",
        itemName: input.itemName || DEFAULT_QB_ITEM,
        lines: [],
      },
    };
  }
  const customerName = resolveCustomerName(input.invoice, {
    clients: input.clients,
    contacts: input.contacts,
    jobs: [input.job],
    opportunities: input.opportunities,
  });
  const contact =
    input.contacts.find((item) => item.id === input.job?.primaryContactId) ??
    input.contacts.find((item) => item.clientId && item.clientId === input.invoice.clientId);
  return {
    blocked: null,
    work: workFromInvoice({
      invoice: input.invoice,
      job: input.job,
      lines: input.lines,
      customerName,
      phone: contact?.phone,
      itemName: input.itemName,
    }),
  };
}

export function expensePushBlocked(expense: Expense) {
  if (!expense.vendor.trim()) return "Add a vendor so QuickBooks has a payee.";
  if (!(expense.amount > 0)) return "That expense has no amount.";
  return null;
}

export function paymentPushBlocked(input: { payment: Payment; invoice?: Invoice; job?: Job }) {
  if (!(input.payment.amount > 0)) return "That payment has no amount.";
  if (input.payment.invoiceId) {
    if (!input.invoice) return "That payment is missing its invoice.";
    if (input.invoice.qbStatus !== "entered") {
      return `Push ${input.invoice.number} to QuickBooks first, then push this payment.`;
    }
    return null;
  }
  if (!input.job) return "Assign this payment to an invoice or a job so QuickBooks knows the customer.";
  return null;
}

export function qbExpenseAccountName(account: ExpenseAccount) {
  return EXPENSE_ACCOUNT_LABELS[account];
}

export function customerFullName(work: { customerName: string }) {
  return qbName(work.customerName);
}

export function billedCustomerName(work: { customerName: string }, useAlias: boolean) {
  const name = customerFullName(work);
  return useAlias ? customerAliasName(name) : name;
}

export function jobFullName(work: { customerName: string; jobCode: string; jobName?: string }, useAlias = false) {
  return customerJobFullName(billedCustomerName(work, useAlias), work.jobCode || work.jobName || "Job");
}

/** ReceivePayment CustomerRef must match the invoice customer — Customer:Job when the invoice hangs on a job. */
export function paymentCustomerRef(work: QbPaymentWork, useAlias = false) {
  return work.hasJob ? jobFullName(work, useAlias) : billedCustomerName(work, useAlias);
}

function resolvedIds(row: Record<string, unknown>) {
  return {
    ...(asString(row.customerListId) ? { customerListId: asString(row.customerListId) } : {}),
    ...(asString(row.jobListId) ? { jobListId: asString(row.jobListId) } : {}),
  };
}

export function parseWorkPayload(raw: unknown): QbwcWork | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const kind = asString(row.kind) || (row.expenseId ? "expense" : row.paymentId ? "payment" : "invoice");
  if (kind === "expense") {
    const expenseId = asString(row.expenseId);
    const vendor = asString(row.vendor);
    if (!expenseId || !vendor) return null;
    return {
      kind: "expense",
      expenseId,
      number: asString(row.number, expenseId),
      vendor,
      accountName: asString(row.accountName, "Other"),
      amount: asNumber(row.amount),
      payWith: asString(row.payWith) === "credit_card" ? "credit_card" : "check",
      txnDate: asString(row.txnDate),
      memo: asString(row.memo),
      payAccount: asString(row.payAccount, DEFAULT_QB_BANK),
      customerName: asString(row.customerName),
      jobCode: asString(row.jobCode),
      jobName: asString(row.jobName),
      street: asString(row.street),
      city: asString(row.city),
      state: asString(row.state),
      postalCode: asString(row.postalCode),
      phone: asString(row.phone),
      hasJob: row.hasJob === true || Boolean(asString(row.jobCode)),
      ...resolvedIds(row),
    };
  }
  if (kind === "payment") {
    const paymentId = asString(row.paymentId);
    if (!paymentId) return null;
    return {
      kind: "payment",
      paymentId,
      amount: asNumber(row.amount),
      txnDate: asString(row.txnDate),
      reference: asString(row.reference),
      memo: asString(row.memo),
      customerName: asString(row.customerName, "Homeowner"),
      jobCode: asString(row.jobCode),
      jobName: asString(row.jobName),
      invoiceNumber: asString(row.invoiceNumber),
      invoiceTxnId: asString(row.invoiceTxnId),
      depositAccount: asString(row.depositAccount, DEFAULT_QB_BANK),
      hasJob: row.hasJob === true || Boolean(asString(row.jobCode)),
      ...resolvedIds(row),
    };
  }
  const invoiceId = asString(row.invoiceId);
  const number = asString(row.number);
  if (!invoiceId || !number) return null;
  const linesRaw = Array.isArray(row.lines) ? row.lines : [];
  return {
    kind: "invoice",
    invoiceId,
    number,
    name: asString(row.name, number),
    issuedAt: asString(row.issuedAt),
    dueAt: asString(row.dueAt) || null,
    notes: asString(row.notes),
    customerName: asString(row.customerName, "Homeowner"),
    jobCode: asString(row.jobCode),
    jobName: asString(row.jobName),
    street: asString(row.street),
    city: asString(row.city),
    state: asString(row.state),
    postalCode: asString(row.postalCode),
    phone: asString(row.phone),
    itemName: asString(row.itemName, DEFAULT_QB_ITEM),
    lines: linesRaw
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((line) => ({
        description: asString(line.description),
        quantity: asNumber(line.quantity, 1),
        unit: asString(line.unit, "ea"),
        unitCost: asNumber(line.unitCost),
      })),
    ...resolvedIds(row),
  };
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
