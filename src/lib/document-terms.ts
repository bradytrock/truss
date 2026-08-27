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
  "Placeholders such as {{contract_price}}, {{deposit}}, {{remaining}}, {{valid_until}}, {{job_site}}, {{customer}}, {{company}}, and {{estimate_number}} fill from this proposal when it is written. Dollar blanks ($____) on payment lines fill from deposit and remaining, and can be typed on the line.";

export const INVOICE_TERMS_HINT =
  "Placeholders such as {{total}}, {{paid}}, {{balance}}, {{due_date}}, {{issued}}, {{customer}}, {{company}}, and {{invoice_number}} fill from this invoice when it is written. Dollar blanks ($____) fill from the invoice and can be typed on the line.";

export const TERMS_PAYMENT_HINT =
  "Payment amounts sit on the $____ lines in the contract — they pull deposit and remaining from the proposal, and can be typed on the line like a signed form. Scope, schedule, changes, and contractor language stay locked. Number a Payment or Contract price heading, or wrap a block in [[payment]] … [[/payment]].";

const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)(?::([0-9.,]+))?\s*\}\}/gi;
const BLANK_RUN = "[_＿—–‐\\-═.\\u2017\\uFF3F\\u00a0 ]";
const PAY_BLANK = new RegExp(`\\$[ \\u00a0]*(?:${BLANK_RUN}{2,})`, "g");
const PAYMENT_LINE_FILLED =
  /Payment\s*(\d+)\s*:\s*\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?=(due|equal|upon)\b)/gi;
const PAYMENT_LINE_BLANK =
  /Payment\s*(\d+)\s*:\s*\$[^a-zA-Z0-9\n{]*?(?=(due|equal|upon)\b)/gi;
const EDITABLE_AMOUNT_KEY = /^(deposit|remaining|balance|pay_\d+|payment_\d+)$/;
const PAYMENT_MARK_START = "[[payment]]";
const PAYMENT_MARK_END = "[[/payment]]";
const PAYMENT_BLOCK = /\[\[\s*payment\s*\]\]([\s\S]*?)\[\[\s*\/\s*payment\s*\]\]/gi;
const NUMBERED_HEADING = /^(\d+)\.\s+(\S.*)$/;
const CAPS_HEADING = /^([A-Z][A-Z0-9][A-Z0-9 /&'.-]{6,})$/;
const PAYMENT_TITLE =
  /\b(payments?|payment terms|pay schedule|deposits?|down payment|contract price|amount due|balance due|billing|invoices?|invoicing|draws?|financing|retainage|progress payments?|consideration)\b/i;
const LOCK_LANGUAGE =
  /\b(scope of work|change order|warranty|liability|indemnif|insurance|permits?|contractor named)\b/i;

export type TermsSection = {
  key: string;
  heading: string;
  body: string;
  payment: boolean;
  marked: boolean;
};

export function stripTermsMarkers(template: string) {
  if (!template) return "";
  return template
    .replace(/^\s*\[\[\s*\/?\s*payment\s*\]\]\s*$/gim, "")
    .replace(/\[\[\s*\/?\s*payment\s*\]\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isHeadingLine(line: string) {
  const trimmed = line.trim();
  return NUMBERED_HEADING.test(trimmed) || CAPS_HEADING.test(trimmed);
}

export function isPaymentHeading(heading: string) {
  return PAYMENT_TITLE.test(heading.trim());
}

function paragraphLooksLikePayment(text: string) {
  const trimmed = text.trim();
  if (!trimmed || LOCK_LANGUAGE.test(trimmed)) return false;
  const first = trimmed.split("\n")[0] ?? "";
  if (isPaymentHeading(first) || isPaymentHeading(trimmed.slice(0, 120))) return true;
  return false;
}

function splitNumbered(text: string, keyPrefix = ""): TermsSection[] {
  const src = text.replace(/\r\n/g, "\n").trim();
  if (!src) return [];
  const lines = src.split("\n");
  const headingAt: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isHeadingLine(lines[i] ?? "")) headingAt.push(i);
  }
  if (headingAt.length === 0) {
    const paras = src.split(/\n{2,}/).map((para) => para.trim()).filter(Boolean);
    if (paras.length <= 1) {
      return [
        {
          key: `${keyPrefix}all`,
          heading: "",
          body: src,
          payment: paragraphLooksLikePayment(src),
          marked: false,
        },
      ];
    }
    return paras.map((para, index) => ({
      key: `${keyPrefix}p:${index}`,
      heading: "",
      body: para,
      payment: paragraphLooksLikePayment(para),
      marked: false,
    }));
  }
  const ranges: Array<{ start: number; end: number }> = [];
  if (headingAt[0] > 0 && lines.slice(0, headingAt[0]).join("\n").trim()) {
    ranges.push({ start: 0, end: headingAt[0] });
  }
  for (let i = 0; i < headingAt.length; i++) {
    ranges.push({ start: headingAt[i] ?? 0, end: headingAt[i + 1] ?? lines.length });
  }
  return ranges.map((range, index) => {
    const slice = lines.slice(range.start, range.end);
    const first = slice[0]?.trim() ?? "";
    const heading = isHeadingLine(first) ? first : "";
    const body = (heading ? slice.slice(1).join("\n") : slice.join("\n")).replace(/^\n+/, "").replace(/\n+$/, "");
    return {
      key: `${keyPrefix}${heading || `s:${index}`}`,
      heading,
      body,
      payment: isPaymentHeading(heading || body.slice(0, 120)),
      marked: false,
    };
  });
}

export function parseTermsSections(template: string): TermsSection[] {
  const src = (template ?? "").replace(/\r\n/g, "\n");
  if (!src.trim()) return [];
  const out: TermsSection[] = [];
  let last = 0;
  let block = 0;
  PAYMENT_BLOCK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PAYMENT_BLOCK.exec(src))) {
    const before = src.slice(last, match.index);
    if (before.trim()) out.push(...splitNumbered(before.trim(), `pre:${block}:`));
    const inner = (match[1] ?? "").trim();
    const innerSections = splitNumbered(inner, `pay:${block}:`);
    if (innerSections.length === 0) {
      out.push({
        key: `pay:${block}`,
        heading: "",
        body: inner,
        payment: true,
        marked: true,
      });
    } else {
      for (const section of innerSections) {
        out.push({ ...section, payment: true, marked: true });
      }
    }
    last = match.index + match[0].length;
    block += 1;
  }
  const after = src.slice(last);
  if (after.trim()) out.push(...splitNumbered(after.trim(), out.length ? "post:" : ""));
  return out.length > 0 ? out : splitNumbered(src);
}

export function formatTermsSection(section: Pick<TermsSection, "heading" | "body">) {
  if (!section.heading.trim()) return section.body;
  if (!section.body.trim()) return section.heading;
  return `${section.heading}\n${section.body}`;
}

export function joinTermsSections(sections: TermsSection[]) {
  return sections
    .map((section) => {
      const core = formatTermsSection(section).replace(/\n+$/, "");
      if (!section.marked) return core;
      return `${PAYMENT_MARK_START}\n${core}\n${PAYMENT_MARK_END}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function sectionMatchKey(section: TermsSection) {
  return (section.heading.replace(/^\d+\.\s*/, "").trim() || section.key).toLowerCase();
}

function termsSkeleton(text: string) {
  return normalizePaymentBlanks(text).replace(/\{\{\s*([a-z0-9_]+)(?::[0-9.,]+)?\s*\}\}/gi, "{{$1}}");
}

export function lockedTermsChanged(existing: string, proposed: string) {
  const current = parseTermsSections(existing)
    .filter((section) => !section.payment)
    .map((section) => termsSkeleton(formatTermsSection(section)).trim());
  const next = parseTermsSections(proposed)
    .filter((section) => !section.payment)
    .map((section) => termsSkeleton(formatTermsSection(section)).trim());
  return current.join("\n\n") !== next.join("\n\n");
}

/** Keep locked company language; apply payment-section bodies from the proposed draft. */
export function mergePaymentTerms(existing: string, proposed: string) {
  const current = parseTermsSections(existing);
  if (current.length === 0) return proposed;
  const next = parseTermsSections(proposed);
  const byKey = new Map(
    next.filter((section) => section.payment).map((section) => [sectionMatchKey(section), section]),
  );
  const byIndex = next.filter((section) => section.payment);
  let paymentIndex = 0;
  const merged = current.map((section) => {
    if (!section.payment) return section;
    const incoming = byKey.get(sectionMatchKey(section)) ?? byIndex[paymentIndex++];
    if (!incoming) return section;
    return { ...section, body: incoming.body };
  });
  return applyPayTokenValues(normalizePaymentBlanks(joinTermsSections(merged)), normalizePaymentBlanks(proposed));
}

export function hasPaymentTermsSections(template: string) {
  if (parseTermsSections(template).some((section) => section.payment)) return true;
  if (/\{\{\s*pay_\d+/i.test(template)) return true;
  if (/Payment\s*\d+\s*:\s*\$/i.test(template)) return true;
  return /\$[ \u00a0]*(?:[_＿—–‐\-═.\u2017\uFF3F]{2,})/.test(template);
}

export function isEditableAmountKey(key: string) {
  return EDITABLE_AMOUNT_KEY.test(key);
}

export function isDepositBoundKey(key: string) {
  return key === "deposit" || key === "pay_1" || key === "payment_1";
}

export function lastPayIndex(template: string) {
  let max = 0;
  for (const match of template.matchAll(/\{\{\s*pay_(\d+)/gi)) {
    max = Math.max(max, Number(match[1]) || 0);
  }
  return max;
}

export function normalizePaymentBlanks(template: string) {
  let src = template ?? "";
  PAYMENT_LINE_FILLED.lastIndex = 0;
  PAYMENT_LINE_BLANK.lastIndex = 0;
  PAY_BLANK.lastIndex = 0;
  src = src.replace(PAYMENT_LINE_FILLED, (_full, n: string, money: string) => {
    const amount = String(money).replace(/,/g, "");
    return `Payment ${n}: {{pay_${Number(n)}:${amount}}} `;
  });
  src = src.replace(PAYMENT_LINE_BLANK, (_full, n: string) => `Payment ${n}: {{pay_${Number(n)}}} `);
  let index = lastPayIndex(src);
  return src.replace(PAY_BLANK, () => `{{pay_${++index}}}`);
}

function formatAmountOverride(raw: string) {
  const amount = parseMoneyInput(raw);
  return amount == null ? raw : formatMoney(amount);
}

export function parseMoneyInput(raw: string) {
  const trimmed = raw.trim().replace(/[$,]/g, "");
  if (!trimmed) return null;
  const amount = Number(trimmed);
  return Number.isFinite(amount) ? amount : null;
}

export function withPaymentDefaults(values: Record<string, string>) {
  const next = { ...values };
  if (!next.pay_1?.trim()) next.pay_1 = values.deposit ?? "";
  if (!next.payment_1?.trim()) next.payment_1 = next.pay_1;
  if (!next.pay_2?.trim()) next.pay_2 = values.remaining || values.balance || "";
  if (!next.payment_2?.trim()) next.payment_2 = next.pay_2;
  return next;
}

function applyPayTokenValues(base: string, proposed: string) {
  const values = new Map<string, string>();
  for (const match of proposed.matchAll(/\{\{\s*([a-z0-9_]+)(?::([0-9.,]+))?\s*\}\}/gi)) {
    const key = match[1]?.toLowerCase() ?? "";
    if (isEditableAmountKey(key)) values.set(key, match[0]);
  }
  if (values.size === 0) return base;
  return base.replace(/\{\{\s*([a-z0-9_]+)(?::([0-9.,]+))?\s*\}\}/gi, (full, key: string) => {
    if (!isEditableAmountKey(key)) return full;
    return values.get(key.toLowerCase()) ?? full;
  });
}

export function setAmountToken(template: string, key: string, amount: number | null) {
  const normalized = normalizePaymentBlanks(template);
  const token = amount == null ? `{{${key}}}` : `{{${key}:${amount}}}`;
  const pattern = new RegExp(`\\{\\{\\s*${key}(?::[0-9.,]+)?\\s*\\}\\}`, "i");
  if (!pattern.test(normalized)) return normalized;
  return normalized.replace(pattern, token);
}

export type TermsInlinePart =
  | { kind: "text"; text: string }
  | { kind: "field"; key: string; override?: string; editable: boolean };

export function splitTermsInline(template: string): TermsInlinePart[] {
  const src = normalizePaymentBlanks(stripTermsMarkers(template ?? ""));
  if (!src) return [];
  const parts: TermsInlinePart[] = [];
  let last = 0;
  PLACEHOLDER.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PLACEHOLDER.exec(src))) {
    if (match.index > last) parts.push({ kind: "text", text: src.slice(last, match.index) });
    const key = match[1]?.toLowerCase() ?? "";
    parts.push({
      kind: "field",
      key,
      override: match[2] || undefined,
      editable: isEditableAmountKey(key),
    });
    last = match.index + match[0].length;
  }
  if (last < src.length) parts.push({ kind: "text", text: src.slice(last) });
  return parts;
}

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
  const resolved = withPaymentDefaults(values);
  return normalizePaymentBlanks(stripTermsMarkers(template)).replace(
    PLACEHOLDER,
    (_, raw: string, override?: string) => {
      if (override?.trim()) return formatAmountOverride(override);
      const key = String(raw).toLowerCase();
      const value = resolved[key]?.trim();
      if (value) return value;
      return isEditableAmountKey(key) ? "$________" : "—";
    },
  );
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
    pay_1: deposit,
    payment_1: deposit,
    pay_2: formatMoney(remaining),
    payment_2: formatMoney(remaining),
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
    deposit: amount,
    balance: formatMoney(balance),
    remaining: formatMoney(balance),
    pay_1: amount,
    payment_1: amount,
    pay_2: formatMoney(balance),
    payment_2: formatMoney(balance),
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
