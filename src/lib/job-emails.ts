import { jobForContact } from "@/lib/job-messages";
import { isDeletedJob } from "@/lib/job-record";
import type { Contact, GmailMessage, Job, Opportunity } from "@/lib/types";

export function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function emailsMatch(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeEmail(left);
  const b = normalizeEmail(right);
  return Boolean(a && a === b);
}

export function contactForEmail(contacts: Contact[], email: string) {
  const needle = normalizeEmail(email);
  if (!needle) return undefined;
  return contacts.find((contact) => normalizeEmail(contact.email) === needle);
}

export function splitEmails(value: string | null | undefined) {
  return (value ?? "")
    .split(/[;,]/)
    .map((part) => normalizeEmail(part.replace(/.*<([^>]+)>.*/, "$1")))
    .filter((email) => email.includes("@"));
}

export function addressesOnMessage(message: Pick<GmailMessage, "fromEmail" | "toEmail" | "ccEmail">) {
  return [...new Set([...splitEmails(message.fromEmail), ...splitEmails(message.toEmail), ...splitEmails(message.ccEmail)])];
}

export function tagsFromAddresses(
  contacts: Array<Pick<Contact, "id" | "email" | "isReferralPartner" | "name" | "title">>,
  emails: string[],
) {
  const matched = emails
    .map((email) => contacts.find((contact) => emailsMatch(contact.email, email)))
    .filter((contact): contact is NonNullable<typeof contact> => Boolean(contact));
  const unique: typeof matched = [];
  for (const contact of matched) {
    if (!unique.some((item) => item.id === contact.id)) unique.push(contact);
  }
  const homeowners = unique.filter((contact) => !contact.isReferralPartner);
  const partners = unique.filter((contact) => contact.isReferralPartner);
  const contactId = homeowners[0]?.id ?? unique[0]?.id ?? null;
  return {
    contactId,
    relatedContactIds: unique.filter((contact) => contact.id !== contactId).map((contact) => contact.id),
    homeowners,
    partners,
    unknown: emails.filter((email) => !contacts.some((contact) => emailsMatch(contact.email, email))),
  };
}

export function messageTouchesContact(
  message: GmailMessage,
  contact: Contact,
) {
  if (message.contactId === contact.id) return true;
  if ((message.relatedContactIds ?? []).includes(contact.id)) return true;
  return addressesOnMessage(message).some((email) => emailsMatch(email, contact.email));
}

export function mailForContact(messages: GmailMessage[], contact: Contact) {
  return [...messages]
    .filter((message) => messageTouchesContact(message, contact))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export function relatedContactsOnThread(messages: GmailMessage[], contacts: Contact[]) {
  const ids = new Set<string>();
  for (const message of messages) {
    if (message.contactId) ids.add(message.contactId);
    for (const id of message.relatedContactIds ?? []) ids.add(id);
    for (const email of addressesOnMessage(message)) {
      const match = contactForEmail(contacts, email);
      if (match) ids.add(match.id);
    }
  }
  return contacts.filter((contact) => ids.has(contact.id));
}

export function suggestedJobsForPeople(
  jobs: Job[],
  opportunities: Opportunity[],
  contactIds: string[],
) {
  const ranked = contactIds
    .map((id) => jobForContact(jobs, opportunities, id))
    .filter((job): job is Job => Boolean(job));
  const unique: Job[] = [];
  for (const job of ranked) {
    if (!unique.some((item) => item.id === job.id)) unique.push(job);
  }
  const extras = jobs.filter(
    (job) =>
      !isDeletedJob(job) &&
      !unique.some((item) => item.id === job.id) &&
      ((job.primaryContactId ? contactIds.includes(job.primaryContactId) : false) ||
        job.relatedContactIds.some((id) => contactIds.includes(id))),
  );
  return [...unique, ...extras].slice(0, 6);
}

export function counterpartEmail(message: GmailMessage) {
  return message.direction === "outbound" ? message.toEmail : message.fromEmail;
}

export function counterpartName(message: GmailMessage, contact?: Contact) {
  if (contact?.name) return contact.name;
  if (message.direction === "outbound") return message.toEmail || "Homeowner";
  return message.fromName || message.fromEmail || "Homeowner";
}

export type MailThread = {
  key: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  contactId: string | null;
  jobId: string | null;
  contact: Contact | undefined;
  relatedContacts: Contact[];
  job: Job | undefined;
  preview: string;
  messages: GmailMessage[];
  lastAt: string;
  unreadHint: boolean;
};

function previewOf(text: string) {
  const value = text.replace(/\s+/g, " ").trim();
  return value.length > 88 ? `${value.slice(0, 87)}…` : value;
}

export function mailThreads(
  emails: GmailMessage[],
  contacts: Contact[],
  jobs: Job[],
  opportunities: Opportunity[],
): MailThread[] {
  const groups = new Map<string, GmailMessage[]>();
  for (const message of emails) {
    const key = message.threadId || message.id;
    const list = groups.get(key) ?? [];
    list.push(message);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([key, items]) => {
      const sorted = [...items].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
      const last = sorted[sorted.length - 1];
      const counterpart = counterpartEmail(last);
      const contact =
        contacts.find((item) => item.id === last.contactId) ??
        sorted.map((item) => contacts.find((row) => row.id === item.contactId)).find(Boolean) ??
        contactForEmail(contacts, counterpart);
      const taggedJobId = [...sorted].reverse().find((item) => item.jobId)?.jobId ?? null;
      const relatedContacts = relatedContactsOnThread(sorted, contacts);
      const job =
        jobs.find((item) => item.id === taggedJobId) ??
        (contact ? jobForContact(jobs, opportunities, contact.id) : undefined) ??
        suggestedJobsForPeople(
          jobs,
          opportunities,
          relatedContacts.map((item) => item.id),
        )[0];
      return {
        key,
        subject: last.subject.trim() || "(no subject)",
        fromName: counterpartName(last, contact),
        fromEmail: counterpart,
        contactId: contact?.id ?? last.contactId,
        jobId: taggedJobId ?? job?.id ?? last.jobId,
        contact,
        relatedContacts,
        job: taggedJobId ? jobs.find((item) => item.id === taggedJobId) : job,
        preview: previewOf(last.snippet || last.bodyText),
        messages: sorted,
        lastAt: last.receivedAt,
        unreadHint: last.direction === "inbound",
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export function filterMailThreads(threads: MailThread[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return threads;
  return threads.filter((thread) => {
    if (thread.subject.toLowerCase().includes(needle)) return true;
    if (thread.fromName.toLowerCase().includes(needle)) return true;
    if (thread.fromEmail.toLowerCase().includes(needle)) return true;
    if (thread.preview.toLowerCase().includes(needle)) return true;
    if (thread.job?.name.toLowerCase().includes(needle)) return true;
    if (thread.job?.code?.toLowerCase().includes(needle)) return true;
    return thread.messages.some(
      (message) =>
        message.bodyText.toLowerCase().includes(needle) ||
        message.toEmail.toLowerCase().includes(needle),
    );
  });
}

export function jobsForMailPicker(jobs: Job[]) {
  return [...jobs]
    .filter((job) => !isDeletedJob(job))
    .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || "") || a.name.localeCompare(b.name));
}

export function mailHref(opts?: {
  thread?: string | null;
  email?: string | null;
  job?: string | null;
  contact?: string | null;
  compose?: boolean;
}) {
  const params = new URLSearchParams();
  if (opts?.compose) params.set("compose", "1");
  if (opts?.thread) params.set("thread", opts.thread);
  if (opts?.email) params.set("email", opts.email);
  if (opts?.job) params.set("job", opts.job);
  if (opts?.contact) params.set("contact", opts.contact);
  const qs = params.toString();
  return qs ? `/mail?${qs}` : "/mail";
}

export function emailActivityBody(message: GmailMessage, contactName?: string) {
  const who = contactName?.trim() || message.fromName || message.fromEmail || "Homeowner";
  const subject = message.subject.trim() || "(no subject)";
  const snippet = (message.snippet || message.bodyText).replace(/\s+/g, " ").trim();
  const clipped = snippet.length > 180 ? `${snippet.slice(0, 179)}…` : snippet;
  const arrow = message.direction === "outbound" ? "to" : "from";
  return `Email ${arrow} ${who}${message.fromEmail && message.direction === "inbound" ? ` <${message.fromEmail}>` : ""}: ${subject}${clipped ? `\n${clipped}` : ""}`;
}

export function gmailAccountForStaff(
  accounts: { staffId: string }[],
  staffId: string,
) {
  return accounts.find((account) => account.staffId === staffId);
}
