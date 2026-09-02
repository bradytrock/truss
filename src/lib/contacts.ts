import { formatJobSite } from "@/lib/leads";
import { parseLocation } from "@/lib/job-record";
import type { Contact } from "@/lib/types";

type SiteRecord = {
  primaryContactId?: string | null;
  contactId?: string | null;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  location?: string;
};

function siteBelongsToContact(record: SiteRecord, contactId: string) {
  return record.primaryContactId === contactId || record.contactId === contactId;
}

export function siteForContact(contactId: string, sites: SiteRecord[]) {
  const matches = sites.filter((item) => siteBelongsToContact(item, contactId));
  return matches.find((item) => siteLabelFromRecord(item)) ?? matches[0];
}

export function siteFieldsFromRecord(record?: SiteRecord | null) {
  if (!record) return { street: "", city: "", state: "", postalCode: "" };
  if (record.street?.trim() || record.city?.trim() || record.state?.trim() || record.postalCode?.trim()) {
    return {
      street: record.street?.trim() ?? "",
      city: record.city?.trim() ?? "",
      state: record.state?.trim() ?? "",
      postalCode: record.postalCode?.trim() ?? "",
    };
  }
  if (record.location?.trim()) return parseLocation(record.location);
  return { street: "", city: "", state: "", postalCode: "" };
}

export function siteLabelFromRecord(record?: SiteRecord | null) {
  const fields = siteFieldsFromRecord(record);
  return formatJobSite(fields) || record?.location?.trim() || "";
}

export function contactOptionParts(
  contact: Pick<Contact, "id" | "name" | "phone" | "email">,
  sites: SiteRecord[],
) {
  const site = siteForContact(contact.id, sites);
  return {
    name: contact.name.trim(),
    phone: contact.phone.trim(),
    address: siteLabelFromRecord(site),
    email: contact.email.trim(),
  };
}

export function contactOptionLabel(
  contact: Pick<Contact, "id" | "name" | "phone" | "email">,
  sites: SiteRecord[],
) {
  const { name, phone, address, email } = contactOptionParts(contact, sites);
  const extras = [phone, address].filter(Boolean);
  if (extras.length === 0 && email) extras.push(email);
  return extras.length ? `${name} · ${extras.join(" · ")}` : name;
}

/** Last word of a personal name — how a paper contact book files the card. */
export function contactFamilyName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

export function contactLetter(name: string) {
  const family = contactFamilyName(name);
  const letter = family.replace(/[^A-Za-z]/g, "").charAt(0).toUpperCase();
  return letter || "#";
}

export function groupContactsByLetter<T extends { name: string }>(contacts: T[]) {
  const sorted = [...contacts].sort((left, right) => {
    const family = contactFamilyName(left.name).localeCompare(contactFamilyName(right.name), undefined, {
      sensitivity: "base",
    });
    if (family !== 0) return family;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
  const groups: { letter: string; contacts: T[] }[] = [];
  for (const contact of sorted) {
    const letter = contactLetter(contact.name);
    const last = groups.at(-1);
    if (last?.letter === letter) last.contacts.push(contact);
    else groups.push({ letter, contacts: [contact] });
  }
  return groups;
}
