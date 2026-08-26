import { digitsOnly, looksLikePhone, toE164 } from "@/lib/phone";
import { isDeletedJob } from "@/lib/job-record";
import type { Contact, Job, Opportunity, TextMessage } from "@/lib/types";

export function phoneKey(value: string | null | undefined) {
  const digits = digitsOnly(value ?? "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function phonesMatch(left: string | null | undefined, right: string | null | undefined) {
  const a = phoneKey(left);
  const b = phoneKey(right);
  return a.length >= 10 && a === b;
}

export function contactForPhone(contacts: Contact[], phone: string) {
  return contacts.find((contact) => phonesMatch(contact.phone, phone));
}

function jobTouchesContact(job: Job, opportunity: Opportunity | undefined, contactId: string) {
  if (job.primaryContactId === contactId) return true;
  if (job.relatedContactIds.includes(contactId)) return true;
  return Boolean(opportunity && opportunity.primaryContactId === contactId);
}

function jobRank(job: Job) {
  if (isDeletedJob(job)) return 9;
  if (job.status === "in_progress") return 0;
  if (job.status === "punch") return 1;
  if (job.status === "precon") return 2;
  if (job.status === "on_hold") return 3;
  return 4;
}

export function jobForContact(jobs: Job[], opportunities: Opportunity[], contactId: string) {
  const ranked = jobs
    .filter((job) => !isDeletedJob(job))
    .filter((job) =>
      jobTouchesContact(
        job,
        opportunities.find((item) => item.id === job.opportunityId),
        contactId,
      ),
    )
    .sort((a, b) => jobRank(a) - jobRank(b) || b.startDate.localeCompare(a.startDate));
  return ranked[0];
}

export function opportunityForContact(opportunities: Opportunity[], contactId: string) {
  return [...opportunities]
    .filter((item) => item.primaryContactId === contactId && item.stage !== "lost")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function threadKey(message: Pick<TextMessage, "contactId" | "phone">) {
  return message.contactId || phoneKey(message.phone) || message.phone;
}

export type MessageThread = {
  key: string;
  phone: string;
  contactId: string | null;
  jobId: string | null;
  opportunityId: string | null;
  contact: Contact | undefined;
  job: Job | undefined;
  opportunity: Opportunity | undefined;
  title: string;
  preview: string;
  messages: TextMessage[];
  lastAt: string;
};

function previewOf(body: string) {
  const text = body.replace(/\s+/g, " ").trim();
  return text.length > 72 ? `${text.slice(0, 71)}…` : text;
}

export function messageThreads(
  messages: TextMessage[],
  contacts: Contact[],
  jobs: Job[],
  opportunities: Opportunity[],
): MessageThread[] {
  const groups = new Map<string, TextMessage[]>();
  for (const message of messages) {
    const key = threadKey(message);
    const list = groups.get(key) ?? [];
    list.push(message);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([key, items]) => {
      const sorted = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const last = sorted[sorted.length - 1];
      const contact =
        contacts.find((item) => item.id === last.contactId) ?? contactForPhone(contacts, last.phone);
      const job =
        jobs.find((item) => item.id === last.jobId) ??
        (contact ? jobForContact(jobs, opportunities, contact.id) : undefined);
      const opportunity =
        opportunities.find((item) => item.id === last.opportunityId) ??
        (job?.opportunityId
          ? opportunities.find((item) => item.id === job.opportunityId)
          : contact
            ? opportunityForContact(opportunities, contact.id)
            : undefined);
      return {
        key,
        phone: toE164(last.phone) || last.phone,
        contactId: contact?.id ?? last.contactId,
        jobId: job?.id ?? last.jobId,
        opportunityId: opportunity?.id ?? last.opportunityId,
        contact,
        job,
        opportunity,
        title: contact?.name || toE164(last.phone) || last.phone || "Unknown number",
        preview: previewOf(last.body),
        messages: sorted,
        lastAt: last.createdAt,
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export function contactsForTexting(contacts: Contact[]) {
  return [...contacts]
    .filter((contact) => looksLikePhone(contact.phone))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function filterMessageThreads(threads: MessageThread[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return threads;
  const digits = needle.replace(/\D/g, "");
  return threads.filter((thread) => {
    if (thread.title.toLowerCase().includes(needle)) return true;
    if (thread.preview.toLowerCase().includes(needle)) return true;
    if (thread.job?.name.toLowerCase().includes(needle)) return true;
    if (thread.job?.code?.toLowerCase().includes(needle)) return true;
    if (digits.length >= 3 && phoneKey(thread.phone).includes(digits)) return true;
    return false;
  });
}

export function messagesHref(opts?: {
  thread?: string | null;
  job?: string | null;
  contact?: string | null;
  compose?: boolean;
}) {
  const params = new URLSearchParams();
  if (opts?.compose) params.set("compose", "1");
  if (opts?.thread) params.set("thread", opts.thread);
  if (opts?.job) params.set("job", opts.job);
  if (opts?.contact) params.set("contact", opts.contact);
  const qs = params.toString();
  return qs ? `/messages?${qs}` : "/messages";
}

export function outboundActivityBody(name: string, phone: string, content: string) {
  const who = name.trim() || "homeowner";
  const number = toE164(phone) || phone;
  return `Texted ${who}${number ? ` (${number})` : ""}:\n${content.trim()}`;
}

export function inboundActivityBody(name: string, content: string) {
  const who = name.trim() || "Homeowner";
  return `${who} texted:\n${content.trim()}`;
}
