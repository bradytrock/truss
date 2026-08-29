import { joinCustomerNames } from "@/lib/estimate-signers";
import { shareUrl } from "@/lib/share";
import type { Client, Contact, CrmState, Estimate, Invoice, Job, Opportunity } from "@/lib/types";

/** People who sign proposals: homeowners, not trades, adjusters, or referral partners. */
export function isJobHomeowner(
  contact: Contact,
  job?: Pick<Job, "subcontractorIds"> | null,
) {
  if (job?.subcontractorIds.includes(contact.id)) return false;
  if (contact.isReferralPartner) return false;
  if (contact.title.toLowerCase().includes("adjuster")) return false;
  return true;
}

export type CustomerRecord = {
  clientId?: string | null;
  contactId?: string | null;
  secondContactId?: string | null;
  primaryContactId?: string | null;
  jobId?: string | null;
  opportunityId?: string | null;
};

type PartyBook = Pick<CrmState, "clients" | "contacts" | "jobs" | "opportunities">;

export function resolveCustomerName(record: CustomerRecord, book: PartyBook): string {
  const client = record.clientId
    ? book.clients.find((item) => item.id === record.clientId)
    : undefined;

  let contactId = record.contactId ?? record.primaryContactId ?? null;
  if (!contactId && record.jobId) {
    contactId = book.jobs.find((job) => job.id === record.jobId)?.primaryContactId ?? null;
  }
  if (!contactId && record.opportunityId) {
    contactId =
      book.opportunities.find((opportunity) => opportunity.id === record.opportunityId)
        ?.primaryContactId ?? null;
  }
  const contact = contactId ? book.contacts.find((item) => item.id === contactId) : undefined;
  const job = record.jobId ? book.jobs.find((item) => item.id === record.jobId) : undefined;
  const second =
    (record.secondContactId
      ? book.contacts.find((item) => item.id === record.secondContactId)
      : undefined) ?? coOwnerContact(job, book.contacts, contactId);
  if (second?.name) {
    const primary = contact?.name ?? client?.name ?? "Homeowner";
    return joinCustomerNames(primary, second.name);
  }
  if (client) return client.name;
  return contact?.name ?? "Homeowner";
}

export type ShareRecipient = {
  id: string;
  name: string;
  phone: string;
  url?: string;
};

function addRecipient(list: ShareRecipient[], contact: Contact | undefined, url?: string) {
  if (!contact) return;
  if (list.some((item) => item.id === contact.id)) return;
  list.push({ id: contact.id, name: contact.name, phone: contact.phone.trim(), url });
}

export function resolveShareContacts(record: CustomerRecord, book: PartyBook): ShareRecipient[] {
  const list: ShareRecipient[] = [];
  let contactId = record.contactId ?? record.primaryContactId ?? null;
  if (!contactId && record.jobId) {
    contactId = book.jobs.find((job) => job.id === record.jobId)?.primaryContactId ?? null;
  }
  if (!contactId && record.opportunityId) {
    contactId =
      book.opportunities.find((opportunity) => opportunity.id === record.opportunityId)
        ?.primaryContactId ?? null;
  }
  addRecipient(list, contactId ? book.contacts.find((item) => item.id === contactId) : undefined);
  const job = record.jobId ? book.jobs.find((item) => item.id === record.jobId) : undefined;
  const second =
    (record.secondContactId
      ? book.contacts.find((item) => item.id === record.secondContactId)
      : undefined) ?? coOwnerContact(job, book.contacts, contactId);
  addRecipient(list, second ?? undefined);
  return list;
}

export function shareContactsForEstimate(estimate: Estimate, book: PartyBook) {
  const list = resolveShareContacts(estimate, book);
  let primaryId = estimate.contactId ?? null;
  if (!primaryId && estimate.jobId) {
    primaryId = book.jobs.find((job) => job.id === estimate.jobId)?.primaryContactId ?? null;
  }
  const job = estimate.jobId ? book.jobs.find((item) => item.id === estimate.jobId) : undefined;
  const secondId =
    estimate.secondContactId || coOwnerContact(job, book.contacts, primaryId)?.id || null;
  const primaryUrl = estimate.shareToken ? shareUrl("e", estimate.shareToken) : undefined;
  const secondUrl =
    estimate.secondShareToken && estimate.secondShareToken !== estimate.shareToken
      ? shareUrl("e", estimate.secondShareToken)
      : undefined;
  return list.map((person) => {
    if (secondId && person.id === secondId && person.id !== primaryId) {
      return secondUrl ? { ...person, url: secondUrl } : person;
    }
    return primaryUrl ? { ...person, url: primaryUrl } : person;
  });
}

export function shareContactsForInvoice(
  invoice: Invoice,
  book: PartyBook & { estimates: Estimate[] }
) {
  const estimate = invoice.estimateId
    ? book.estimates.find((item) => item.id === invoice.estimateId)
    : undefined;
  return resolveShareContacts(
    {
      clientId: invoice.clientId,
      jobId: invoice.jobId,
      contactId: estimate?.contactId,
      secondContactId: estimate?.secondContactId,
    },
    book
  );
}

export function jobsForContact(contact: Contact, jobs: Job[]) {
  return jobs.filter((job) => {
    if (job.deletedAt) return false;
    if (job.primaryContactId === contact.id) return true;
    if (job.relatedContactIds.includes(contact.id)) return true;
    if (job.subcontractorIds.includes(contact.id)) return true;
    if (contact.clientId && job.clientId === contact.clientId) return true;
    return false;
  });
}

/** Homeowners on a job: primary plus related contacts. Trades are not included. */
export function contactsOnJob(
  job: Pick<Job, "primaryContactId" | "relatedContactIds"> | undefined,
  contacts: Contact[],
  extraIds: Array<string | null | undefined> = [],
) {
  const ids: string[] = [];
  const seen = new Set<string>();
  function push(id: string | null | undefined) {
    const trimmed = id?.trim() ?? "";
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    ids.push(trimmed);
  }
  push(job?.primaryContactId);
  for (const id of job?.relatedContactIds ?? []) push(id);
  for (const id of extraIds) push(id);
  const found = ids
    .map((id) => contacts.find((contact) => contact.id === id))
    .filter((contact): contact is Contact => Boolean(contact));
  if (job) return found;
  return contacts;
}

export function homeownersOnJob(
  job: Pick<Job, "primaryContactId" | "relatedContactIds" | "subcontractorIds"> | undefined,
  contacts: Contact[],
  extraIds: Array<string | null | undefined> = [],
) {
  return contactsOnJob(job, contacts, extraIds).filter((contact) => isJobHomeowner(contact, job));
}

/** Second signer when a job has two homeowners (primary + a related co-owner). */
export function coOwnerContact(
  job: Pick<Job, "primaryContactId" | "relatedContactIds" | "subcontractorIds"> | undefined,
  contacts: Contact[],
  primaryId?: string | null,
) {
  if (!job) return null;
  const primary = (primaryId || job.primaryContactId || "").trim();
  return homeownersOnJob(job, contacts).find((contact) => contact.id !== primary) ?? null;
}

export function applyCoOwnerToEstimate<
  T extends { contactId: string | null; secondContactId: string | null; jobId: string | null },
>(estimate: T, jobs: Job[], contacts: Contact[]): T {
  if (estimate.secondContactId) return estimate;
  const job = estimate.jobId ? jobs.find((item) => item.id === estimate.jobId) : undefined;
  const coOwner = coOwnerContact(job, contacts, estimate.contactId);
  if (!coOwner) return estimate;
  return { ...estimate, secondContactId: coOwner.id };
}

export function opportunitiesForContact(contact: Contact, opportunities: Opportunity[]) {
  return opportunities.filter((opportunity) => {
    if (opportunity.primaryContactId === contact.id) return true;
    if (contact.clientId && opportunity.clientId === contact.clientId) return true;
    return false;
  });
}

export function companyOrHomeowner(client: Client | undefined, contact: Contact | undefined) {
  if (client) return client.name;
  if (contact) return contact.name;
  return "Homeowner";
}
