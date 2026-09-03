import { digitsOnly, toE164 } from "@/lib/phone";
import type { CompanySettings, StaffMember } from "@/lib/types";

export type SharedCardCompany = {
  name: string;
  phone: string;
  email: string;
  website: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  logoUrl: string;
  /** Wide logo for the card header. Blank falls back to logoUrl. */
  cardLogoUrl: string;
  slug: string;
};

export type SharedCardPerson = {
  name: string;
  title: string;
  initials: string;
  email: string;
  phone: string;
  photoUrl: string;
  cardSlug: string;
};

export type SharedCardPayload = {
  available: boolean;
  company: SharedCardCompany;
  person: SharedCardPerson | null;
};

export function cardPath(companySlug: string, personSlug: string) {
  return `/${companySlug}/card/${personSlug}`;
}

export function cardUrl(companySlug: string, personSlug: string, origin = "") {
  const path = cardPath(companySlug, personSlug);
  if (origin) return `${origin.replace(/\/+$/, "")}${path}`;
  if (typeof window !== "undefined") return `${window.location.origin}${path}`;
  return path;
}

export function websiteHref(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function telHref(phone: string) {
  const e164 = toE164(phone);
  if (e164) return `tel:${e164}`;
  const digits = digitsOnly(phone);
  return digits ? `tel:${digits}` : "";
}

export function smsHref(phone: string) {
  const e164 = toE164(phone);
  if (e164) return `sms:${e164}`;
  const digits = digitsOnly(phone);
  return digits ? `sms:${digits}` : "";
}

function vcardEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export function vcardText(input: {
  person: SharedCardPerson;
  company: SharedCardCompany;
  url: string;
}) {
  const { first, last } = splitName(input.person.name);
  const phone = toE164(input.person.phone) || digitsOnly(input.person.phone);
  const website = websiteHref(input.company.website);
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${vcardEscape(last)};${vcardEscape(first)};;;`,
    `FN:${vcardEscape(input.person.name)}`,
  ];
  if (input.company.name.trim()) lines.push(`ORG:${vcardEscape(input.company.name.trim())}`);
  if (input.person.title.trim()) lines.push(`TITLE:${vcardEscape(input.person.title.trim())}`);
  if (phone) lines.push(`TEL;TYPE=CELL,VOICE:${phone}`);
  if (input.person.email.trim()) lines.push(`EMAIL;TYPE=INTERNET:${vcardEscape(input.person.email.trim())}`);
  if (/^https?:\/\//i.test(input.person.photoUrl.trim())) {
    lines.push(`PHOTO;VALUE=URI:${vcardEscape(input.person.photoUrl.trim())}`);
  }
  if (input.url) lines.push(`URL:${vcardEscape(input.url)}`);
  if (website) lines.push(`URL;TYPE=WORK:${vcardEscape(website)}`);
  const street = input.company.street.trim();
  const city = input.company.city.trim();
  const state = input.company.state.trim();
  const postal = input.company.postalCode.trim();
  if (street || city || state || postal) {
    lines.push(
      `ADR;TYPE=WORK:;;${vcardEscape(street)};${vcardEscape(city)};${vcardEscape(state)};${vcardEscape(postal)};`,
    );
  }
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export function downloadVcard(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/vcard;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename.endsWith(".vcf") ? filename : `${filename}.vcf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(href);
}

/** Wide card logo when one is set, otherwise the document logo. */
export function cardHeaderLogo(company: Pick<SharedCardCompany, "cardLogoUrl" | "logoUrl">) {
  return company.cardLogoUrl.trim() || company.logoUrl.trim();
}

export function cardUrlForSeat(
  company: Pick<CompanySettings, "slug"> | null | undefined,
  member: Pick<StaffMember, "cardSlug"> | null | undefined,
  origin = "",
) {
  const companySlug = company?.slug?.trim() ?? "";
  const personSlug = member?.cardSlug?.trim() ?? "";
  if (!companySlug || !personSlug) return "";
  return cardUrl(companySlug, personSlug, origin);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseSharedCard(raw: unknown): SharedCardPayload | null {
  if (!isRecord(raw)) return null;
  const companyRaw = isRecord(raw.company) ? raw.company : null;
  if (!companyRaw) return null;
  const company: SharedCardCompany = {
    name: asString(companyRaw.name).trim(),
    phone: asString(companyRaw.phone).trim(),
    email: asString(companyRaw.email).trim(),
    website: asString(companyRaw.website).trim(),
    street: asString(companyRaw.street).trim(),
    city: asString(companyRaw.city).trim(),
    state: asString(companyRaw.state).trim(),
    postalCode: asString(companyRaw.postalCode).trim(),
    logoUrl: asString(companyRaw.logoUrl).trim(),
    cardLogoUrl: asString(companyRaw.cardLogoUrl).trim(),
    slug: asString(companyRaw.slug).trim(),
  };
  if (!company.name && !company.slug) return null;
  const available = raw.available !== false;
  const personRaw = isRecord(raw.person) ? raw.person : null;
  if (!available || !personRaw) {
    return { available: false, company, person: null };
  }
  const person: SharedCardPerson = {
    name: asString(personRaw.name).trim(),
    title: asString(personRaw.title).trim(),
    initials: asString(personRaw.initials).trim() || asString(personRaw.name).slice(0, 2).toUpperCase(),
    email: asString(personRaw.email).trim(),
    phone: asString(personRaw.phone).trim(),
    photoUrl: asString(personRaw.photoUrl).trim(),
    cardSlug: asString(personRaw.cardSlug).trim(),
  };
  if (!person.name) return { available: false, company, person: null };
  return { available: true, company, person };
}
