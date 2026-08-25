import { DEFAULT_ESTIMATE_TERMS, estimateTotals } from "@/lib/estimate-totals";
import { formatDate, formatMoney } from "@/lib/format";
import { formatJobSite } from "@/lib/leads";
import { invoiceBalance, invoiceTotal, paidOnInvoice } from "@/lib/money";
import type {
  CompanySettings,
  Estimate,
  EstimateLine,
  Invoice,
  InvoiceLine,
  Payment,
} from "@/lib/types";

export { DEFAULT_ESTIMATE_TERMS };

export const DEFAULT_INVOICE_TERMS = `1. Amount due
The amount of this invoice is {{total}}. {{paid}} has been applied. The balance due is {{balance}}.

2. Payment
Payment is due on {{due_date}}. Any deposit on this invoice is due before remaining work continues. Past-due balances may pause the job until paid.

3. Contractor
{{company}} issued {{invoice_number}} to {{customer}} on {{issued}}.`;

export const ESTIMATE_TERMS_HINT =
  "Placeholders such as {{contract_price}}, {{deposit}}, {{remaining}}, {{valid_until}}, {{job_site}}, {{customer}}, {{company}}, and {{estimate_number}} fill from this proposal when it is written.";

export const INVOICE_TERMS_HINT =
  "Placeholders such as {{total}}, {{paid}}, {{balance}}, {{due_date}}, {{issued}}, {{customer}}, {{company}}, and {{invoice_number}} fill from this invoice when it is written.";

const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

function firstCopiedTerms(...candidates: Array<string | null | undefined>) {
  for (const value of candidates) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

export function resolveEstimateTerms(input: {
  explicit?: string | null;
  templateTerms?: string | null;
  companyDefault?: string | null;
}) {
  return firstCopiedTerms(input.explicit, input.templateTerms, input.companyDefault) ?? DEFAULT_ESTIMATE_TERMS;
}

export function resolveInvoiceTerms(input: {
  explicit?: string | null;
  companyDefault?: string | null;
}) {
  return firstCopiedTerms(input.explicit, input.companyDefault) ?? DEFAULT_INVOICE_TERMS;
}

export function fillTermsPlaceholders(template: string, values: Record<string, string>) {
  if (!template) return "";
  return template.replace(PLACEHOLDER, (_, raw: string) => {
    const key = String(raw).toLowerCase();
    const value = values[key]?.trim();
    return value || "—";
  });
}

function textOr(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim() ?? "";
  return trimmed || fallback;
}

function dateOr(value: string | null | undefined, fallback: string) {
  if (!value?.trim()) return fallback;
  const formatted = formatDate(value);
  return formatted === "—" ? fallback : formatted;
}

export function estimateTermsValues(input: {
  estimate: Pick<
    Estimate,
    | "number"
    | "name"
    | "validUntil"
    | "street"
    | "city"
    | "state"
    | "postalCode"
    | "taxRate"
    | "discountKind"
    | "discountValue"
    | "depositKind"
    | "depositValue"
  >;
  lines: EstimateLine[];
  customer: string;
  company?: Pick<CompanySettings, "name" | "licenseNumber">;
}) {
  const totals = estimateTotals(input.estimate, input.lines);
  const remaining = Math.max(0, totals.total - totals.deposit);
  const site = formatJobSite(input.estimate);
  const company = textOr(input.company?.name, "the contractor");
  const customer = textOr(input.customer, "the customer named on this proposal");
  const price = formatMoney(totals.total);
  const deposit = formatMoney(totals.deposit);
  const jobSite = textOr(site, "the job site on this proposal");
  const number = textOr(input.estimate.number, "this proposal");
  const validUntil = dateOr(input.estimate.validUntil, "the valid-until date on this proposal");
  return {
    contract_price: price,
    total: price,
    price,
    subtotal: formatMoney(totals.subtotal),
    tax: formatMoney(totals.tax),
    discount: formatMoney(totals.discount),
    deposit,
    remaining: formatMoney(remaining),
    balance: formatMoney(remaining),
    valid_until: validUntil,
    valid_until_date: validUntil,
    customer,
    client: customer,
    homeowner: customer,
    company,
    contractor: company,
    job_site: jobSite,
    site: jobSite,
    address: jobSite,
    estimate_number: number,
    number,
    proposal_name: textOr(input.estimate.name, "this proposal"),
    name: textOr(input.estimate.name, "this proposal"),
    license: textOr(input.company?.licenseNumber, "the license on file"),
  };
}

export function filledEstimateTerms(input: {
  template: string;
  estimate: Parameters<typeof estimateTermsValues>[0]["estimate"];
  lines: EstimateLine[];
  customer: string;
  company?: Pick<CompanySettings, "name" | "licenseNumber">;
}) {
  return fillTermsPlaceholders(input.template, estimateTermsValues(input));
}

export function invoiceTermsValues(input: {
  invoice: Pick<Invoice, "id" | "number" | "name" | "issuedAt" | "dueAt">;
  lines: InvoiceLine[];
  payments?: Payment[];
  customer: string;
  company?: Pick<CompanySettings, "name" | "licenseNumber">;
}) {
  const total = invoiceTotal(input.invoice.id, input.lines);
  const paid = paidOnInvoice(input.invoice.id, input.payments ?? []);
  const balance = invoiceBalance(input.invoice.id, input.lines, input.payments ?? []);
  const company = textOr(input.company?.name, "the contractor");
  const customer = textOr(input.customer, "the customer named on this invoice");
  const amount = formatMoney(total);
  const due = dateOr(input.invoice.dueAt, "the due date on this invoice");
  const issued = dateOr(input.invoice.issuedAt, "the issue date on this invoice");
  const number = textOr(input.invoice.number, "this invoice");
  return {
    contract_price: amount,
    total: amount,
    price: amount,
    paid: formatMoney(paid),
    balance: formatMoney(balance),
    remaining: formatMoney(balance),
    due_date: due,
    due,
    issued,
    issued_at: issued,
    customer,
    client: customer,
    homeowner: customer,
    company,
    contractor: company,
    invoice_number: number,
    number,
    name: textOr(input.invoice.name, "this invoice"),
    license: textOr(input.company?.licenseNumber, "the license on file"),
  };
}

export function filledInvoiceTerms(input: {
  template: string;
  invoice: Parameters<typeof invoiceTermsValues>[0]["invoice"];
  lines: InvoiceLine[];
  payments?: Payment[];
  customer: string;
  company?: Pick<CompanySettings, "name" | "licenseNumber">;
}) {
  return fillTermsPlaceholders(input.template, invoiceTermsValues(input));
}
