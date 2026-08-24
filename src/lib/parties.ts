import { joinCustomerNames } from "@/lib/estimate-signers";
import type { Client, Contact, CrmState, Estimate, Invoice, Job, Opportunity } from "@/lib/types";

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
  const second = record.secondContactId
    ? book.contacts.find((item) => item.id === record.secondContactId)
    : undefined;
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
};

function addRecipient(list: ShareRecipient[], contact: Contact | undefined) {
  if (!contact) return;
  if (list.some((item) => item.id === contact.id)) return;
  list.push({ id: contact.id, name: contact.name, phone: contact.phone.trim() });
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
  addRecipient(
    list,
    record.secondContactId
      ? book.contacts.find((item) => item.id === record.secondContactId)
      : undefined
  );
  return list;
}

export function shareContactsForEstimate(estimate: Estimate, book: PartyBook) {
  return resolveShareContacts(estimate, book);
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
