import { formatJobSite } from "@/lib/leads";
import { parseLocation } from "@/lib/job-record";
import type { Contact } from "@/lib/types";

type SiteRecord = {
  primaryContactId?: string | null;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  location?: string;
};

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

export function contactOptionLabel(
  contact: Pick<Contact, "id" | "name" | "phone" | "email">,
  sites: SiteRecord[],
) {
  const site = sites.find((item) => item.primaryContactId === contact.id);
  const extra = contact.phone.trim() || siteLabelFromRecord(site) || contact.email.trim();
  return extra ? `${contact.name} · ${extra}` : contact.name;
}
