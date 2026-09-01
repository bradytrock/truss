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
      const job =
        jobs.find((item) => item.id === taggedJobId) ??
        (contact ? jobForContact(jobs, opportunities, contact.id) : undefined);
      return {
        key,
        subject: last.subject.trim() || "(no subject)",
        fromName: counterpartName(last, contact),
        fromEmail: counterpart,
        contactId: contact?.id ?? last.contactId,
        jobId: taggedJobId ?? job?.id ?? last.jobId,
        contact,
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
}) {
  const params = new URLSearchParams();
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
