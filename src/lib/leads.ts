import { phoneQueryMatches } from "@/lib/phone";
import { isLeadSource, isPickableLeadSource, LEAD_SOURCE_LABELS, LEAD_SOURCES } from "@/lib/lead-sources";
import type { DeliveryMethod } from "@/lib/types";

/** Most work is in Texas; the lead form can still change this. */
export const DEFAULT_LEAD_STATE = "TX";

export function leadStateOrDefault(state?: string | null) {
  const value = state?.trim() ?? "";
  return value || DEFAULT_LEAD_STATE;
}

export function formatJobSite(input: {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}) {
  const street = input.street?.trim() ?? "";
  const city = input.city?.trim() ?? "";
  const state = input.state?.trim() ?? "";
  const postal = input.postalCode?.trim() ?? "";
  const cityState = [city, state].filter(Boolean).join(", ");
  const locality = [cityState, postal].filter(Boolean).join(" ");
  return [street, locality].filter(Boolean).join(", ");
}

/** Label for any stored seed, hidden ones included; unknown values print as-is. */
export function leadSourceLabel(source: string | null | undefined) {
  if (!source) return "";
  return isLeadSource(source) ? LEAD_SOURCE_LABELS[source] : source;
}

/**
 * Picker choices for a record: every pickable seed, plus the record's current seed
 * when it is hidden or unknown, so editing never silently drops it.
 */
export function leadSourceChoices(current?: string | null): string[] {
  const value = current?.trim() ?? "";
  if (value && !isPickableLeadSource(value)) {
    return [value, ...LEAD_SOURCES];
  }
  return [...LEAD_SOURCES];
}

export function defaultDeliveryForSource(source: string): DeliveryMethod {
  if (source === "insurance" || source === "storm") return "insurance_claim";
  return "fixed_price";
}

export function leadName(first: string, last: string, site: string) {
  const full = `${first.trim()} ${last.trim()}`.trim();
  if (site) return `${last.trim() || full} — ${site}`;
  return full || "New lead";
}

/** Job title: the LLC when the property is owned by one, otherwise the person's name. */
export function leadRecordName(input: {
  first: string;
  last: string;
  site: string;
  companyName?: string | null;
}) {
  const company = input.companyName?.trim() ?? "";
  const site = input.site.trim();
  if (company) return site ? `${company} — ${site}` : company;
  return leadName(input.first, input.last, site);
}

/** Person on an LLC-owned job is the owner you call. Everyone else stays a homeowner. */
export function leadContactTitle(companyName?: string | null) {
  return companyName?.trim() ? "Owner" : "Homeowner";
}

export function companyNameKey(name: string) {
  return name.trim().toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ");
}

/** Reuse an LLC already in the book instead of opening a second company with the same name. */
export function matchingCompany<T extends { name: string }>(companies: T[], name: string) {
  const key = companyNameKey(name);
  if (!key) return undefined;
  return companies.find((company) => companyNameKey(company.name) === key);
}

export const RELATED_CONTACT_ROLES = [
  { value: "property_manager", label: "Property manager" },
  { value: "tenant", label: "Tenant" },
  { value: "leasing", label: "Leasing agent" },
  { value: "owner", label: "Owner" },
  { value: "other", label: "Other" },
] as const;

export type RelatedContactRole = (typeof RELATED_CONTACT_ROLES)[number]["value"];

export function relatedContactTitle(role: string, custom?: string | null) {
  if (role === "other") return custom?.trim() || "Property manager";
  const match = RELATED_CONTACT_ROLES.find((item) => item.value === role);
  return match && match.value !== "other" ? match.label : "Property manager";
}

/** Realtor and referral seeds name who sent the lead. */
export function leadNeedsReferrer(source: string | null | undefined) {
  return source === "realtor" || source === "referral";
}

/**
 * Referral seeds can name a person or a group that is not in the contact book.
 * Realtor seeds still pick a partner.
 */
export function leadReferrerAllowsFreeText(source: string | null | undefined) {
  return source === "referral";
}

export type LeadReferrer = { contactId: string | null; name: string } | { error: string };

/**
 * Realtor leads keep a contact from the book.
 * Referral leads accept that contact, or any typed name or group.
 */
export function resolveLeadReferrer(input: {
  source: string | null | undefined;
  contactId?: string | null;
  contactName?: string | null;
  text?: string | null;
}): LeadReferrer {
  if (!leadNeedsReferrer(input.source)) return { contactId: null, name: "" };
  const contactId = input.contactId?.trim() || "";
  const contactName = input.contactName?.trim() || "";
  const text = input.text?.trim() || "";
  if (input.source === "realtor") {
    if (!contactId) return { error: "Choose the referral partner who sent this lead." };
    return { contactId, name: contactName };
  }
  const name = contactId ? contactName || text : text;
  if (!contactId && !name) return { error: "Enter who sent this referral." };
  return { contactId: contactId || null, name };
}

export function referralPartners<T extends { isReferralPartner?: boolean; name: string }>(contacts: T[]) {
  return contacts
    .filter((contact) => Boolean(contact.isReferralPartner))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function matchReferralPartners<
  T extends { isReferralPartner?: boolean; name: string; title?: string; email?: string; phone?: string },
>(contacts: T[], query: string) {
  const partners = referralPartners(contacts);
  const needle = query.trim().toLowerCase();
  if (!needle) return partners;
  return partners.filter((contact) => {
    if (phoneQueryMatches(contact.phone, query)) return true;
    const haystack = `${contact.name} ${contact.title ?? ""} ${contact.email ?? ""} ${contact.phone ?? ""}`.toLowerCase();
    return haystack.includes(needle);
  });
}
