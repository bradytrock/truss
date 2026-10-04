import assert from "node:assert/strict";
import { alertStamp, type LeadAlert } from "./lead-alerts.ts";
import {
  inboxItem,
  markInboxStampsRead,
  mergeInbox,
  notificationAssignsRep,
  unreadInbox,
} from "./notification-inbox.ts";

function item(id: string, at: string, updated = at): ReturnType<typeof inboxItem> {
  const alert: LeadAlert = {
    id,
    kind: "needs_rep",
    title: "New lead needs a rep",
    lead: {
      id: "lead-1",
      company_id: "co-1",
      opportunity_id: null,
      job_id: null,
      status: "unassigned",
      assigned_to: null,
      passed_back_by: null,
      passed_back_by_name: "",
      passback_reason: "",
      handoff_note: "",
      homeowner_name: "Dana Alvarez",
      street: "100 Main",
      city: "Plano",
      service_type: "",
      source: "",
      phone: "",
      created_at: updated,
      updated_at: updated,
    },
    noteId: "",
    noteBody: "",
    authorName: "",
    arrivedAt: Date.parse(at),
  };
  return inboxItem(alert, at);
}

const older = item("lead-1:needs_rep:", "2026-10-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z");
const newer = item("lead-1:needs_rep:", "2026-10-04T00:00:00.000Z", "2026-10-04T00:00:00.000Z");
const other = item("lead-2:needs_rep:", "2026-10-03T00:00:00.000Z", "2026-10-03T00:00:00.000Z");

assert.equal(mergeInbox([older, other, newer]).map((entry) => entry.at).join(","), [
  newer.at,
  other.at,
].join(","));

assert.equal(unreadInbox([newer, other], [older.stamp]).length, 2);
assert.equal(unreadInbox([newer], [newer.stamp]).length, 0);
assert.deepEqual(markInboxStampsRead([older.stamp], [newer.stamp]), [older.stamp, newer.stamp]);
assert.notEqual(alertStamp(older.alert), alertStamp(newer.alert));
assert.equal(notificationAssignsRep("needs_rep", true), true);
assert.equal(notificationAssignsRep("passed_back", true), true);
assert.equal(notificationAssignsRep("needs_rep", false), false);
assert.equal(notificationAssignsRep("rep_note", true), false);
assert.equal(notificationAssignsRep("new_lead", true), false);
