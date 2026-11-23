import { formatCompanyAddressLines, formatDate, formatPhone } from "@/lib/format";
import { joinCustomerNames } from "@/lib/estimate-signers";
import { parseTermsSections } from "@/lib/document-terms";

export const PAPER_RED = { r: 196, g: 18, b: 28 };
export const PAPER_INK = { r: 20, g: 20, b: 20 };
export const PAPER_MUTED = { r: 110, g: 110, b: 110 };
export const PAPER_LINE = { r: 28, g: 28, b: 28 };
export const PAPER_CARD = { r: 245, g: 245, b: 245 };
export const PAPER_INSET = 48;

/** Invoice sheet palette. Matches the invoice template (red, ink, body, muted, line, soft). */
export const INVOICE_RED = { r: 208, g: 32, b: 46 };
export const INVOICE_INK = { r: 17, g: 20, b: 24 };
export const INVOICE_BODY = { r: 43, g: 48, b: 54 };
export const INVOICE_MUTED = { r: 107, g: 114, b: 123 };
export const INVOICE_LINE = { r: 227, g: 230, b: 234 };
export const INVOICE_SOFT = { r: 246, g: 247, b: 249 };
export const INVOICE_PILL_SUB = { r: 185, g: 190, b: 197 };

export const PAPER_RED_HEX = "#c4121c";
export const PAPER_INK_HEX = "#141414";
export const PAPER_MUTED_HEX = "#6e6e6e";
export const PAPER_CARD_HEX = "#f5f5f5";

export type PaperKind = "estimate" | "invoice";

export function paperKindLabel(kind: PaperKind) {
  return kind === "invoice" ? "INVOICE" : "ESTIMATE";
}

export function paperSiteTitle(input: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  name?: string | null;
  kindTitle?: string;
}) {
  const street = input.street?.trim() || "";
  const city = input.city?.trim() || "";
  const state = input.state?.trim() || "";
  const postal = input.postalCode?.trim() || "";
  const locality = [city, [state, postal].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return {
    title: street || input.name?.trim() || input.kindTitle || "Proposal",
    locality,
  };
}

export function paperCompanyLines(company: {
  name: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  website?: string;
  licenseNumber?: string;
}) {
  const address = formatCompanyAddressLines({
    street: company.street ?? "",
    city: company.city ?? "",
    state: company.state ?? "",
    postalCode: company.postalCode ?? "",
  });
  const phone = formatPhone(company.phone ?? "");
  const contactLines = [
    phone && phone !== "—" ? phone : "",
    company.email?.trim() ?? "",
    company.website?.trim() ?? "",
  ].filter(Boolean);
  return {
    name: company.name.trim() || "Company",
    address,
    contactLines,
    contact: contactLines.join(" · "),
    license: company.licenseNumber?.trim() ? `License ${company.licenseNumber.trim()}` : "",
  };
}

export function paperFooterLeft(company: {
  name: string;
  phone?: string;
  website?: string;
  email?: string;
}) {
  const phone = formatPhone(company.phone ?? "");
  return [
    company.name.trim(),
    company.website?.trim() || company.email?.trim() || "",
    phone && phone !== "—" ? phone : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function paperMetaBlank(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || "—";
}

export function paperIssuedAt(input: { sentAt?: string | null; createdAt?: string | null }) {
  return input.sentAt?.trim() || input.createdAt?.trim() || "";
}

export type PaperMetaItem = { label: string; value: string };

export function paperEstimateMeta(input: {
  number: string;
  issuedAt?: string | null;
  validUntil?: string | null;
  jobCode?: string | null;
}): PaperMetaItem[] {
  return [
    { label: "Estimate no.", value: paperMetaBlank(input.number) },
    { label: "Issued", value: input.issuedAt ? formatDate(input.issuedAt) : "—" },
    { label: "Valid until", value: input.validUntil ? formatDate(input.validUntil) : "—" },
    { label: "Job", value: paperMetaBlank(input.jobCode) },
  ];
}

export function paperInvoiceMeta(input: {
  number: string;
  issuedAt?: string | null;
  dueAt?: string | null;
  jobCode?: string | null;
}): PaperMetaItem[] {
  return [
    { label: "Invoice no.", value: paperMetaBlank(input.number) },
    { label: "Issued", value: input.issuedAt ? formatDate(input.issuedAt) : "—" },
    { label: "Due", value: input.dueAt ? formatDate(input.dueAt) : "—" },
    { label: "Job", value: paperMetaBlank(input.jobCode) },
  ];
}

/** Summary band across the top of an invoice: date, due date, job, amount due. */
export function paperInvoiceBand(input: {
  issuedAt?: string | null;
  dueAt?: string | null;
  jobCode?: string | null;
  amountDue: string;
}): PaperMetaItem[] {
  return [
    { label: "Invoice date", value: input.issuedAt ? formatDate(input.issuedAt) : "—" },
    { label: "Due date", value: input.dueAt ? formatDate(input.dueAt) : "—" },
    { label: "Job", value: paperMetaBlank(input.jobCode) },
    { label: "Amount due", value: input.amountDue },
  ];
}

export type PaperInvoiceHomeowner = { name: string; phone?: string | null };

/**
 * Bill to card on an invoice: every homeowner on the job with their phone,
 * then the property address. Falls back to the customer label when the job
 * has no homeowner contacts.
 */
export function paperInvoiceBillTo(input: {
  customer: string;
  homeowners?: PaperInvoiceHomeowner[] | null;
  addressLines?: string[];
}) {
  const seen = new Set<string>();
  const people = (input.homeowners ?? [])
    .map((person) => ({ name: person.name.trim(), lines: [paperPhone(person.phone)].filter(Boolean) }))
    .filter((person) => {
      const key = person.name.toLowerCase();
      if (!person.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return {
    label: "Bill to",
    people: people.length ? people : [{ name: input.customer.trim() || "—", lines: [] as string[] }],
    lines: (input.addressLines ?? []).filter(Boolean),
  };
}

/** Small line under BALANCE DUE in the invoice pill. */
export function paperBalanceDueNote(input: { balance: number; total: number; dueAt?: string | null }) {
  if (input.total > 0 && input.balance <= 0.005) return "Paid in full";
  if (input.dueAt) return `by ${formatDate(input.dueAt)}`;
  return "";
}

/** Lines under the Payment label at the foot of an invoice. */
export function paperInvoicePaymentCopy(input: {
  number: string;
  companyName: string;
  paymentNote?: string | null;
}) {
  const name = input.companyName.trim() || "the contractor";
  const payable = input.paymentNote?.trim() || `Checks payable to ${name}.`;
  return [`Please reference ${input.number.trim()} with your payment.`, payable];
}

/** Lines under the Questions? label: who to reach, phone, then email. */
export function paperInvoiceQuestionsCopy(
  manager: { name?: string | null; phone?: string | null; email?: string | null } | null | undefined,
  company: { name: string; phone?: string | null; email?: string | null },
) {
  const who = manager?.name?.trim() || company.name.trim() || "us";
  const phone = paperPhone(manager?.phone) || paperPhone(company.phone);
  const email = manager?.email?.trim() || company.email?.trim() || "";
  const first = phone ? `Contact ${who} at ${phone}` : `Contact ${who}`;
  if (!email) return [first];
  return [first, phone ? `or ${email}` : `at ${email}`];
}

export function paperInvoiceThanks(companyName: string) {
  const name = companyName.trim() || "us";
  return `Thank you for trusting ${name} with your home.`;
}

/** Street · City, ST ZIP · phone along the bottom of an invoice. */
export function paperInvoiceFooterRight(company: {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  phone?: string;
}) {
  const address = formatCompanyAddressLines({
    street: company.street ?? "",
    city: company.city ?? "",
    state: company.state ?? "",
    postalCode: company.postalCode ?? "",
  });
  return [...address, paperPhone(company.phone)].filter(Boolean).join(" · ");
}

export function paperOptionChoiceCopy() {
  return "Please choose the option you prefer. The price shown with it is the full amount for that selection.";
}

export function paperAuthorizationCopy(companyName: string) {
  const name = companyName.trim() || "the contractor";
  return `By signing below I authorize ${name} to perform the work described in this estimate for the total shown. I have read and agree to the terms on the preceding pages.`;
}

export function paperRescissionCopy() {
  return "You, the buyer, may cancel this transaction at any time prior to midnight of the third business day after the date you sign. See the attached notice of cancellation for an explanation of this right.";
}

export function paperSplitColumns<T>(items: T[]): [T[], T[]] {
  const mid = Math.ceil(items.length / 2);
  return [items.slice(0, mid), items.slice(mid)];
}

export function paperTermsColumns(template: string) {
  return paperSplitColumns(parseTermsSections(template));
}

export function paperQtyLabel(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return String(value);
  return String(value);
}

function paperPhone(value: string | null | undefined) {
  const formatted = formatPhone(value);
  return formatted === "—" ? "" : formatted;
}

/**
 * Name on a Prepared for card. Prefer the homeowner on the job. The client
 * record is often the lead label ("Last — street"), which repeats the address
 * already printed above the card.
 */
export function paperPreparedForName(input: {
  customer?: string | null;
  primary?: string | null;
  second?: string | null;
}) {
  const primary = input.primary?.trim() ?? "";
  if (primary) return joinCustomerNames(primary, input.second);
  return input.customer?.trim() || "—";
}

/** Lines under the client name on a Prepared for card: phone, then email. */
export function paperPreparedForLines(input: {
  phone?: string | null;
  email?: string | null;
  secondPhone?: string | null;
  secondEmail?: string | null;
}) {
  const phone = paperPhone(input.phone);
  const email = input.email?.trim() ?? "";
  const lines = [phone, email].filter(Boolean);
  const secondPhone = paperPhone(input.secondPhone);
  const secondEmail = input.secondEmail?.trim() ?? "";
  if (secondPhone && secondPhone !== phone) lines.push(secondPhone);
  if (secondEmail && secondEmail.toLowerCase() !== email.toLowerCase()) lines.push(secondEmail);
  return lines;
}

export function paperPreparedForCard(input: {
  name: string;
  phone?: string | null;
  email?: string | null;
  secondPhone?: string | null;
  secondEmail?: string | null;
}) {
  return {
    label: "Prepared for",
    name: input.name.trim() || "—",
    lines: paperPreparedForLines(input),
  };
}

/** Project manager card lines: title, then phone, then email, each on its own line. */
export function paperManagerLines(
  manager: {
    title?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null | undefined,
  companyPhone?: string | null,
) {
  const title = manager?.title?.trim() || "Project Manager";
  const phone = paperPhone(manager?.phone) || paperPhone(companyPhone);
  const email = manager?.email?.trim() ?? "";
  return [title, phone, email].filter(Boolean);
}
