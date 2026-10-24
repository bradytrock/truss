import assert from "node:assert/strict";
import { buildGmailSyncRows, gmailSyncUpsertBatches } from "./gmail-sync.ts";
import type { ParsedGmailMessage } from "./google-gmail.ts";

function message(gmailId: string): ParsedGmailMessage {
  return {
    gmailId,
    threadId: `thread-${gmailId}`,
    fromName: "Dana Alvarez",
    fromEmail: "dana@example.com",
    toEmail: "office@example.com",
    ccEmail: "",
    subject: "Gate",
    snippet: "Leave the gate open.",
    bodyText: "Leave the gate open.",
    receivedAt: "2026-10-24T15:00:00.000Z",
    direction: "inbound",
  };
}

const rows = buildGmailSyncRows({
  companyId: "company-1",
  accountId: "account-1",
  messages: [message("saved"), message("new")],
  existing: [
    {
      id: "existing-id",
      gmail_id: "saved",
      job_id: "job-1",
      contact_id: "contact-1",
      related_contact_ids: ["contact-2"],
    },
  ],
  contacts: [
    {
      id: "contact-9",
      email: "dana@example.com",
      name: "Dana Alvarez",
      title: "",
      isReferralPartner: false,
    },
  ],
  newId: () => "generated-id",
});

assert.equal(rows[0]?.id, "existing-id");
assert.equal(rows[0]?.job_id, "job-1");
assert.deepEqual(rows[0]?.related_contact_ids, ["contact-2"]);
assert.equal(rows[1]?.id, "generated-id");
assert.equal(rows[1]?.contact_id, "contact-9");
assert.equal(rows[1]?.job_id, null);

const { updates, inserts } = gmailSyncUpsertBatches(rows, new Set(["saved"]));
assert.equal(updates.length, 1);
assert.equal(updates[0]?.id, "existing-id");
assert.equal("id" in (inserts[0] ?? {}), false);

const insertColumns = [...new Set(inserts.flatMap((row) => Object.keys(row)))];
assert.equal(insertColumns.includes("id"), false);
assert.equal(updates.every((row) => typeof row.id === "string" && row.id.length > 0), true);

const missed = gmailSyncUpsertBatches(rows, new Set());
assert.equal(missed.updates.length, 0);
assert.equal(missed.inserts.every((row) => !("id" in row)), true);
