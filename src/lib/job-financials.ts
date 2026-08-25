import type {
  Expense,
  ExpenseAccount,
  ExpenseMethod,
  Invoice,
  InvoiceLine,
  Job,
  Payment,
  QbSyncStatus,
} from "@/lib/types";
import { invoiceTotal, paidOnInvoice } from "@/lib/money";

export function isQbEntered(status: QbSyncStatus | undefined) {
  return status === "entered";
}

export function fillPayment(
  payment: Omit<Payment, "jobId" | "receiptUrl" | "receiptStoragePath" | "qbStatus" | "createdBy"> &
    Partial<Payment>,
): Payment {
  return {
    id: payment.id,
    invoiceId: payment.invoiceId ?? null,
    jobId: payment.jobId ?? null,
    amount: payment.amount,
    method: payment.method,
    paidAt: payment.paidAt,
    reference: payment.reference ?? "",
    receiptUrl: payment.receiptUrl ?? "",
    receiptStoragePath: payment.receiptStoragePath ?? null,
    qbStatus: payment.qbStatus ?? "not_in_qb",
    createdBy: payment.createdBy ?? "",
  };
}

export function fillInvoiceQb(
  invoice: Omit<Invoice, "qbStatus" | "terms"> & Partial<Pick<Invoice, "qbStatus" | "terms">>,
): Invoice {
  return {
    ...invoice,
    terms: invoice.terms ?? "",
    qbStatus: invoice.qbStatus ?? (invoice.status === "paid" ? "entered" : "not_in_qb"),
  };
}

export function paymentsForJob(jobId: string, payments: Payment[], invoices: Invoice[]) {
  const invoiceIds = new Set(
    invoices.filter((invoice) => invoice.jobId === jobId).map((invoice) => invoice.id),
  );
  return payments.filter((payment) => payment.jobId === jobId || (payment.invoiceId && invoiceIds.has(payment.invoiceId)));
}

export function expensesForJob(jobId: string, expenses: Expense[]) {
  return expenses.filter((expense) => expense.jobId === jobId);
}

export type JobBooksBasis = "accrual" | "cash";

export function jobProfitAndLoss(input: {
  job: Job;
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  payments: Payment[];
  expenses: Expense[];
  basis: JobBooksBasis;
}) {
  const jobInvoices = input.invoices.filter(
    (invoice) => invoice.jobId === input.job.id && invoice.status !== "void" && invoice.status !== "draft",
  );
  const invoiced = jobInvoices.reduce(
    (sum, invoice) => sum + invoiceTotal(invoice.id, input.invoiceLines),
    0,
  );
  const jobPayments = paymentsForJob(input.job.id, input.payments, input.invoices);
  const collected = jobPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const jobExpenses = expensesForJob(input.job.id, input.expenses);
  const expenses = jobExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const income = input.basis === "cash" ? collected : invoiced;
  const profit = income - expenses;
  const margin = income > 0 ? profit / income : 0;
  const ar = Math.max(0, invoiced - collected);
  const byAccount: Record<string, number> = {};
  for (const expense of jobExpenses) {
    byAccount[expense.account] = (byAccount[expense.account] ?? 0) + expense.amount;
  }
  return {
    contractValue: input.job.contractValue,
    invoiced,
    collected,
    expenses,
    income,
    profit,
    margin,
    ar,
    byAccount,
    invoiceCount: jobInvoices.length,
    expenseCount: jobExpenses.length,
    paymentCount: jobPayments.length,
  };
}

export function qbQueue(input: {
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  payments: Payment[];
  expenses: Expense[];
}) {
  const invoices = input.invoices.filter(
    (invoice) =>
      invoice.qbStatus !== "entered" &&
      invoice.status !== "draft" &&
      invoice.status !== "void",
  );
  const expenses = input.expenses.filter((expense) => expense.qbStatus !== "entered");
  const payments = input.payments.filter((payment) => payment.qbStatus !== "entered");
  const invoiceTotalDue = invoices.reduce(
    (sum, invoice) => sum + invoiceTotal(invoice.id, input.invoiceLines),
    0,
  );
  return {
    invoices,
    expenses,
    payments,
    invoiceCount: invoices.length,
    expenseCount: expenses.length,
    paymentCount: payments.length,
    invoiceTotalDue,
    expenseTotal: expenses.reduce((sum, expense) => sum + expense.amount, 0),
    paymentTotal: payments.reduce((sum, payment) => sum + payment.amount, 0),
  };
}

export function guessExpenseAccount(vendor: string, memo: string): ExpenseAccount {
  const text = `${vendor} ${memo}`.toLowerCase();
  if (/dump|waste|rolloff/.test(text)) return "dumpsters";
  if (/rental|sunbelt|united rent/.test(text)) return "equipment_rental";
  if (/permit|city of|county/.test(text)) return "permits";
  if (/sub|roofing crew|plumber|electric/.test(text)) return "subcontractors";
  if (/shell|exxon|fuel|gas/.test(text)) return "fuel";
  if (/home depot|lowe|abc supply|srs|beacon|building/.test(text)) return "materials";
  if (/payroll|labor/.test(text)) return "labor";
  if (/state farm|hartford|policy/.test(text)) return "insurance";
  return "materials";
}

export function isExpenseAccount(value: string): value is ExpenseAccount {
  return (
    value === "materials" ||
    value === "subcontractors" ||
    value === "equipment_rental" ||
    value === "dumpsters" ||
    value === "permits" ||
    value === "labor" ||
    value === "fuel" ||
    value === "office" ||
    value === "insurance" ||
    value === "other"
  );
}

export function isExpenseMethod(value: string): value is ExpenseMethod {
  return (
    value === "credit_card" ||
    value === "debit" ||
    value === "check" ||
    value === "ach" ||
    value === "cash"
  );
}

export async function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

export async function compressReceipt(file: File, maxEdge = 1600): Promise<{ dataUrl: string; file: File }> {
  const dataUrl = await fileToDataUrl(file);
  if (!file.type.startsWith("image/") || typeof document === "undefined") {
    return { dataUrl, file };
  }
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale >= 1) return { dataUrl, file };
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { dataUrl, file };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const next = canvas.toDataURL("image/jpeg", 0.82);
    const blob = await (await fetch(next)).blob();
    return { dataUrl: next, file: new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) };
  } catch {
    return { dataUrl, file };
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

export function jobIncomeToDate(jobId: string, payments: Payment[], invoices: Invoice[]) {
  return paymentsForJob(jobId, payments, invoices).reduce((sum, payment) => sum + payment.amount, 0);
}

export { paidOnInvoice };
