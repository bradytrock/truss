import { formatCompanyAddressLines, formatDate, formatPhone } from "@/lib/format";
import { joinCustomerNames } from "@/lib/estimate-signers";
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

export type PaperContactRow = { label: string; value: string };

export type PaperPartyPerson = {
  name: string;
  detail: string[];
  rows: PaperContactRow[];
};

export type PaperPartyCard = {
  label: string;
  people: PaperPartyPerson[];
};

function contactRows(phone?: string | null, email?: string | null): PaperContactRow[] {
  const rows: PaperContactRow[] = [];
  const formatted = paperPhone(phone);
  if (formatted) rows.push({ label: "Phone", value: formatted });
  const mail = email?.trim() ?? "";
  if (mail) rows.push({ label: "Email", value: mail });
  return rows;
}

/** One block per homeowner. A second person keeps their own phone and email. */
export function paperPreparedForPeople(input: {
  customer?: string | null;
  primary?: string | null;
  second?: string | null;
  phone?: string | null;
  email?: string | null;
  secondPhone?: string | null;
  secondEmail?: string | null;
}): PaperPartyPerson[] {
  const primary = input.primary?.trim() || input.customer?.trim() || "";
  const second = input.second?.trim() || "";
  const people: PaperPartyPerson[] = [];
  if (primary) {
    people.push({
      name: primary,
      detail: [],
      rows: contactRows(input.phone, input.email),
    });
  }
  if (second && second !== primary) {
    people.push({
      name: second,
      detail: [],
      rows: contactRows(input.secondPhone, input.secondEmail),
    });
  }
  if (!people.length) people.push({ name: "—", detail: [], rows: [] });
  return people;
}

export function paperPreparedForCard(input: {
  customer?: string | null;
  primary?: string | null;
  second?: string | null;
  /** Already-resolved single name, used when primary and customer are blank. */
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  secondPhone?: string | null;
  secondEmail?: string | null;
}): PaperPartyCard {
  return {
    label: "Prepared for",
    people: paperPreparedForPeople({
      customer: input.customer?.trim() || input.name,
      primary: input.primary,
      second: input.second,
      phone: input.phone,
      email: input.email,
      secondPhone: input.secondPhone,
      secondEmail: input.secondEmail,
    }),
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

export function paperManagerCard(
  manager: {
    name?: string | null;
    title?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null | undefined,
  companyPhone?: string | null,
): PaperPartyCard {
  const name = manager?.name?.trim() || "";
  if (!name) {
    return { label: "Project manager", people: [{ name: "—", detail: [], rows: [] }] };
  }
  return {
    label: "Project manager",
    people: [
      {
        name,
        detail: [manager?.title?.trim() || "Project Manager"],
        rows: contactRows(manager?.phone || companyPhone, manager?.email),
      },
    ],
  };
}

/** Line label under a signature rule, e.g. "Project Manager signature". */
export function paperSignatureCaption(title?: string | null, fallback = "Project Manager") {
  const raw = title?.trim() || fallback;
  return /signature$/i.test(raw) ? raw : `${raw} signature`;
}

/** Second line under the project manager's printed name on the authorization page. */
export function paperManagerSignatureDetail(
  manager: {
    title?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null | undefined,
  companyName: string,
) {
  const title = manager?.title?.trim() || "Project Manager";
  const company = companyName.trim();
  const phone = paperPhone(manager?.phone);
  const email = manager?.email?.trim() ?? "";
  const head = [title, company].filter(Boolean).join(", ");
  return [head, phone, email].filter(Boolean).join(" · ");
}
