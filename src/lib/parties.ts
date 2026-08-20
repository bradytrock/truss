import type { Client, Contact, CrmState, Job, Opportunity } from "@/lib/types";

export type CustomerRecord = {
  clientId?: string | null;
  primaryContactId?: string | null;
  jobId?: string | null;
  opportunityId?: string | null;
};

type PartyBook = Pick<CrmState, "clients" | "contacts" | "jobs" | "opportunities">;

export function resolveCustomerName(record: CustomerRecord, book: PartyBook): string {
  const client = record.clientId
    ? book.clients.find((item) => item.id === record.clientId)
    : undefined;
  if (client) return client.name;

  let contactId = record.primaryContactId ?? null;
  if (!contactId && record.jobId) {
    contactId = book.jobs.find((job) => job.id === record.jobId)?.primaryContactId ?? null;
  }
  if (!contactId && record.opportunityId) {
    contactId =
      book.opportunities.find((opportunity) => opportunity.id === record.opportunityId)
        ?.primaryContactId ?? null;
  }
  const contact = contactId ? book.contacts.find((item) => item.id === contactId) : undefined;
  return contact?.name ?? "Homeowner";
}

export function jobsForContact(contact: Contact, jobs: Job[]) {
  return jobs.filter((job) => {
    if (job.primaryContactId === contact.id) return true;
    if (job.relatedContactIds.includes(contact.id)) return true;
    if (job.subcontractorIds.includes(contact.id)) return true;
    if (contact.clientId && job.clientId === contact.clientId) return true;
    return false;
  });
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
