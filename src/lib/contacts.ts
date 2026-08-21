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
