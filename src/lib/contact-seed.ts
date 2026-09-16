import { siteFieldsFromRecord, siteLabelFromRecord } from "@/lib/contacts";
import { DEFAULT_LEAD_STATE, formatJobSite, leadName } from "@/lib/leads";
import { jobsForContact } from "@/lib/parties";
import type { Contact, Job, LeadSource } from "@/lib/types";

export type JobSiteFields = {
  street: string;
  city: string;
  state: string;
  postalCode: string;
};

export function splitContactName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] ?? "" };
}

export function previousJobForContact(contact: Contact, jobs: Job[]) {
  return (
    [...jobsForContact(contact, jobs)]
      .filter((job) => !job.deletedAt)
      .sort((left, right) => {
        const byStart = (right.startDate || "").localeCompare(left.startDate || "");
        if (byStart !== 0) return byStart;
        return (right.code || "").localeCompare(left.code || "");
      })[0] ?? null
  );
}

export function previousJobSite(job: Job | null | undefined): JobSiteFields {
  return siteFieldsFromRecord(job);
}

export function hasJobSite(site: JobSiteFields) {
  return Boolean(formatJobSite(site));
}

export function resolveContactSeedSite(input: {
  hasPreviousSite: boolean;
  sameAsPrevious: boolean;
  previous: JobSiteFields;
  next: JobSiteFields;
}): { site: JobSiteFields; blocked: string | null } {
  if (input.hasPreviousSite && input.sameAsPrevious) {
    return { site: input.previous, blocked: null };
  }
  const street = input.next.street.trim();
  const city = input.next.city.trim();
  const state = input.next.state.trim() || DEFAULT_LEAD_STATE;
  const postalCode = input.next.postalCode.trim();
  if (!street || !city) {
    return {
      site: { street, city, state, postalCode },
      blocked: "Enter the street and city for the new address.",
    };
  }
  return { site: { street, city, state, postalCode }, blocked: null };
}

export function contactSeedLeadSource(job: Job | null | undefined): LeadSource {
  if (job) return "past_client";
  return "phone";
}

export function contactSeedLeadName(contactName: string, site: JobSiteFields) {
  const { first, last } = splitContactName(contactName);
  return leadName(first, last, formatJobSite(site));
}

export function previousJobSiteLabel(job: Job | null | undefined) {
  return siteLabelFromRecord(job);
}
