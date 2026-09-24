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

export function conversationThreadKey(input: {
  contactId?: string | null;
  phone?: string | null;
  fromNumber?: string | null;
  toNumber?: string | null;
}) {
  for (const value of [input.phone, input.fromNumber, input.toNumber]) {
    const last10 = phoneKey(value);
    if (last10.length >= 10) return `p:${last10}`;
  }
  const contactId = input.contactId?.trim().toLowerCase();
  return contactId ? `c:${contactId}` : "";
}

export function messageConversationKey(
  message: Pick<TextMessage, "contactId" | "phone" | "fromNumber" | "toNumber">,
  contacts: Contact[],
) {
  const direct = conversationThreadKey(message);
  if (direct.startsWith("p:")) return direct;
  const contact = message.contactId
    ? contacts.find((item) => item.id === message.contactId)
    : contactForPhone(contacts, message.phone);
  if (contact) {
    const fromContact = conversationThreadKey({
      contactId: contact.id,
      phone: contact.phone,
    });
    if (fromContact) return fromContact;
  }
  return direct;
}

/** @deprecated Use conversationThreadKey / messageConversationKey. Kept for old inbox URLs. */
export function threadKey(message: Pick<TextMessage, "contactId" | "phone" | "fromNumber" | "toNumber">) {
  return conversationThreadKey(message);
}

export function resolveInboxThreadKey(raw: string | null | undefined, contacts: Contact[]) {
  const value = raw?.trim() ?? "";
  if (!value) return "";
  if (value.startsWith("p:")) return value;
  if (value.startsWith("c:")) return `c:${value.slice(2).toLowerCase()}`;
  const contact = contacts.find((row) => row.id === value);
  if (contact) return conversationThreadKey({ contactId: contact.id, phone: contact.phone });
  const last10 = phoneKey(value);
  if (last10.length >= 10) return `p:${last10}`;
  return value;
}

export type MessageThread = {
  key: string;
  phone: string;
  contactId: string | null;
  contactIds: string[];
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

function messageMatchesThreadKey(
  message: Pick<TextMessage, "contactId" | "phone" | "fromNumber" | "toNumber">,
  key: string,
  relatedIds: Set<string>,
) {
  if (message.contactId && relatedIds.has(message.contactId)) return true;
  if (key.startsWith("p:")) {
    const last10 = key.slice(2);
    return [message.phone, message.fromNumber, message.toNumber].some((value) => {
      if (!value) return false;
      return phoneKey(value) === last10 || value.includes(last10);
    });
  }
  return false;
}

function namedContact(candidates: Contact[]) {
  return (
    candidates.find((contact) => {
      const name = contact.name.trim();
      return Boolean(name) && !looksLikePhone(name);
    }) ?? candidates[0]
  );
}

export function messageThreads(
  messages: TextMessage[],
  contacts: Contact[],
  jobs: Job[],
  opportunities: Opportunity[],
): MessageThread[] {
  const keys = new Set<string>();
  for (const message of messages) {
    const key = messageConversationKey(message, contacts);
    if (key) keys.add(key);
  }

  const groups = new Map<string, TextMessage[]>();
  const used = new Set<string>();
  for (const key of keys) {
    const relatedIds = new Set(
      key.startsWith("p:")
        ? contacts.filter((contact) => phoneKey(contact.phone) === key.slice(2)).map((contact) => contact.id)
        : key.startsWith("c:")
          ? [key.slice(2)]
          : [],
    );
    const items = messages.filter((message) => {
      if (used.has(message.id)) return false;
      if (messageConversationKey(message, contacts) === key) return true;
      return messageMatchesThreadKey(message, key, relatedIds);
    });
    if (items.length === 0) continue;
    for (const item of items) used.add(item.id);
    groups.set(key, items);
  }

  return [...groups.entries()]
    .map(([key, items]) => {
      const sorted = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const last = sorted[sorted.length - 1];
      const relatedIds =
        key.startsWith("p:")
          ? contacts.filter((contact) => phoneKey(contact.phone) === key.slice(2))
          : contacts.filter(
              (contact) =>
                sorted.some((message) => message.contactId === contact.id) ||
                (key.startsWith("c:") && contact.id.toLowerCase() === key.slice(2)),
            );
      const contact =
        namedContact(relatedIds) ??
        contacts.find((item) => item.id === last.contactId) ??
        contactForPhone(contacts, last.phone);
      const contactIds = [
        ...new Set(
          [
            ...relatedIds.map((item) => item.id),
            ...sorted.map((message) => message.contactId).filter((id): id is string => Boolean(id)),
          ],
        ),
      ];
      const job =
        jobs.find((item) => item.id === last.jobId) ??
        (contact ? jobForContact(jobs, opportunities, contact.id) : undefined) ??
        contactIds.map((id) => jobForContact(jobs, opportunities, id)).find(Boolean);
      const opportunity =
        opportunities.find((item) => item.id === last.opportunityId) ??
        (job?.opportunityId
          ? opportunities.find((item) => item.id === job.opportunityId)
          : undefined) ??
        (contact ? opportunityForContact(opportunities, contact.id) : undefined) ??
        contactIds.map((id) => opportunityForContact(opportunities, id)).find(Boolean);
      const phone =
        last.phone ||
        last.fromNumber ||
        last.toNumber ||
        contact?.phone ||
        (key.startsWith("p:") ? key.slice(2) : "");
      return {
        key,
        phone: toE164(phone) || phone,
        contactId: contact?.id ?? last.contactId,
        contactIds,
        jobId: job?.id ?? last.jobId,
        opportunityId: opportunity?.id ?? last.opportunityId,
        contact,
        job,
        opportunity,
        title: (contact && contact.name.trim() && !looksLikePhone(contact.name) ? contact.name.trim() : "") ||
          toE164(phone) ||
          phone ||
          "Unknown number",
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
