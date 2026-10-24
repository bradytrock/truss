import { addressesOnMessage, tagsFromAddresses } from "@/lib/job-emails";
import type { ParsedGmailMessage } from "@/lib/google-gmail";
import type { Database } from "@/lib/supabase/database.types";
import type { Contact } from "@/lib/types";

export type GmailSyncExisting = {
  id: string;
  gmail_id: string;
  job_id: string | null;
  contact_id: string | null;
  related_contact_ids: string[] | null;
};

type BookContact = Pick<Contact, "id" | "email" | "name" | "title" | "isReferralPartner">;

export type GmailSyncInsert = Database["public"]["Tables"]["gmail_messages"]["Insert"] & {
  id: string;
  gmail_id: string;
};

/**
 * Bulk upsert sends the union of object keys as PostgREST `columns`. A key
 * present on only some rows is inserted as NULL on the rest, which skips
 * `gen_random_uuid()` and violates `gmail_messages.id` NOT NULL.
 * `gmailSyncUpsertBatches` keeps saved ids on updates and omits `id` on new
 * rows so those two shapes are never sent in one request.
 */
export function buildGmailSyncRows(input: {
  companyId: string;
  accountId: string;
  messages: ParsedGmailMessage[];
  existing: GmailSyncExisting[];
  contacts: BookContact[];
  newId?: () => string;
}): GmailSyncInsert[] {
  const newId = input.newId ?? (() => crypto.randomUUID());
  const byGmailId = new Map(input.existing.map((row) => [row.gmail_id, row]));
  return input.messages.map((message) => {
    const prior = byGmailId.get(message.gmailId);
    const tags = tagsFromAddresses(
      input.contacts,
      addressesOnMessage({
        fromEmail: message.fromEmail,
        toEmail: message.toEmail,
        ccEmail: message.ccEmail,
      }),
    );
    return {
      id: prior?.id || newId(),
      company_id: input.companyId,
      account_id: input.accountId,
      gmail_id: message.gmailId,
      thread_id: message.threadId,
      from_name: message.fromName,
      from_email: message.fromEmail,
      to_email: message.toEmail,
      cc_email: message.ccEmail,
      subject: message.subject,
      snippet: message.snippet,
      body_text: message.bodyText,
      received_at: message.receivedAt,
      direction: message.direction,
      job_id: prior?.job_id ?? null,
      contact_id: prior?.contact_id ?? tags.contactId,
      related_contact_ids: prior?.related_contact_ids?.length
        ? prior.related_contact_ids
        : tags.relatedContactIds,
    };
  });
}

export function gmailSyncUpsertBatches(rows: GmailSyncInsert[], existingGmailIds: ReadonlySet<string>) {
  const updates: GmailSyncInsert[] = [];
  const inserts: Omit<GmailSyncInsert, "id">[] = [];
  for (const row of rows) {
    if (existingGmailIds.has(row.gmail_id) && row.id) {
      updates.push(row);
      continue;
    }
    const { id: _id, ...insert } = row;
    inserts.push(insert);
  }
  return { updates, inserts };
}
