import { formatCompanyAddressLines, formatDate, formatPhone } from "@/lib/format";
import { parseTermsSections } from "@/lib/document-terms";

export const PAPER_RED = { r: 196, g: 18, b: 28 };
export const PAPER_INK = { r: 20, g: 20, b: 20 };
export const PAPER_MUTED = { r: 110, g: 110, b: 110 };
export const PAPER_LINE = { r: 28, g: 28, b: 28 };
export const PAPER_CARD = { r: 245, g: 245, b: 245 };
export const PAPER_INSET = 48;

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
  const contact = [
    phone && phone !== "—" ? phone : "",
    company.email?.trim() ?? "",
    company.website?.trim() ?? "",
  ].filter(Boolean);
  return {
    name: company.name.trim() || "Company",
    address,
    contact: contact.join(" · "),
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
