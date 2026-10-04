import assert from "node:assert/strict";
import {
  acceptAlert,
  actionsForViewer,
  alertForMyAssignmentInsert,
  alertForMyAssignmentUpdate,
  alertForRepNote,
  alertForUnassignedInsert,
  alertForUnassignedUpdate,
  alertFromCatchUp,
  alertKey,
  dismissAlert,
  emptyAlertMemory,
  leadDetailLine,
  leadPhoneHref,
  leadPlaceLine,
  notificationBody,
  passbackSummary,
  snapshotFromRow,
  stackAlerts,
  type LeadActivitySnapshot,
  type LeadSnapshot,
} from "./lead-alerts.ts";

function lead(overrides: Partial<LeadSnapshot> = {}): LeadSnapshot {
  return snapshotFromRow({
    id: "lead-1",
    company_id: "co-1",
    opportunity_id: "opp-1",
    job_id: "job-1",
    status: "assigned",
    assigned_to: "pm-1",
    passed_back_by: null,
    passed_back_by_name: "",
    passback_reason: "",
    handoff_note: "",
    homeowner_name: "Dana Alvarez",
    street: "100 Main",
    city: "Plano",
    service_type: "roofing",
    source: "website",
    phone: "2145550100",
    created_at: "2026-10-04T17:00:00.000Z",
    updated_at: "2026-10-04T17:00:00.000Z",
    ...overrides,
  });
}

const note: LeadActivitySnapshot = {
  id: "note-1",
  lead_id: "lead-1",
  user_id: "pm-1",
  author_name: "Alex Rivera",
  kind: "rep_note",
  body: "I'm with a client and will call them within 20 minutes.",
  created_at: "2026-10-04T17:05:00.000Z",
};

const inserted = alertForMyAssignmentInsert(lead(), "pm-1", 100);
assert.ok(inserted);
assert.equal(inserted.kind, "new_lead");
assert.equal(inserted.title, "New lead");
assert.equal(inserted.id, alertKey("new_lead", "lead-1"));
assert.equal(alertForMyAssignmentInsert(lead(), "someone-else"), null);

const assigned = alertForMyAssignmentUpdate(lead({ updated_at: "2026-10-04T17:10:00.000Z" }), { assigned_to: null }, "pm-1", 200);
assert.ok(assigned);
assert.equal(assigned.title, "Lead assigned to you");
assert.equal(alertForMyAssignmentUpdate(lead(), { assigned_to: "pm-1" }, "pm-1"), null);
assert.equal(alertForMyAssignmentUpdate(lead(), { status: "assigned" }, "pm-1"), null);

const needsRep = alertForUnassignedInsert(
  lead({ status: "unassigned", assigned_to: null, passed_back_by: null }),
  true,
);
assert.ok(needsRep);
assert.equal(needsRep.title, "New lead needs a rep");
assert.equal(alertForUnassignedInsert(lead({ status: "unassigned", assigned_to: null }), false), null);

const passed = alertForUnassignedUpdate(
  lead({
    status: "unassigned",
    assigned_to: null,
    passed_back_by: "pm-1",
    passed_back_by_name: "Alex Rivera",
    passback_reason: "Outside my area",
    handoff_note: "South of the loop",
    updated_at: "2026-10-04T17:12:00.000Z",
  }),
  { status: "assigned", assigned_to: "pm-1" },
  true,
);
assert.ok(passed);
assert.equal(passed.title, "Passed back by Alex Rivera");
assert.equal(passbackSummary(passed.lead), 'Outside my area · "South of the loop"');
assert.equal(
  alertForUnassignedUpdate(
    lead({ status: "unassigned", assigned_to: null }),
    { status: "unassigned" },
    true,
  ),
  null,
);

const repNote = alertForRepNote(note, lead(), "admin-1", true, 300);
assert.ok(repNote);
assert.equal(repNote.title, "Note from Alex Rivera");
assert.equal(repNote.noteId, "note-1");
assert.equal(alertForRepNote(note, lead(), "pm-1", true), null);
assert.equal(alertForRepNote(note, lead(), "admin-1", false), null);

assert.equal(leadPlaceLine(lead()), "100 Main · Plano");
assert.equal(leadDetailLine(lead()), "Roofing · Website");
assert.equal(leadPhoneHref("2145550100"), "tel:+12145550100");
assert.equal(leadPhoneHref(""), "");
assert.equal(notificationBody(repNote), note.body);
assert.match(notificationBody(inserted), /Dana Alvarez/);

const first = acceptAlert(emptyAlertMemory(), inserted);
const duplicate = acceptAlert(first, inserted);
assert.equal(duplicate.queue.length, 1);
assert.equal(duplicate, first);

const newer = acceptAlert(
  dismissAlert(first, inserted.id),
  alertForMyAssignmentInsert(lead({ updated_at: "2026-10-04T18:00:00.000Z" }), "pm-1", 400)!,
);
assert.equal(newer.queue.length, 1);
assert.equal(newer.queue[0]?.lead.updated_at, "2026-10-04T18:00:00.000Z");

const many = [0, 1, 2, 3].reduce((memory, index) => {
  const row = lead({ id: `lead-${index}`, updated_at: `2026-10-04T17:0${index}:00.000Z` });
  return acceptAlert(memory, alertForMyAssignmentInsert(row, "pm-1", index)!);
}, emptyAlertMemory());
const stack = stackAlerts(many.queue);
assert.equal(stack.visible.length, 3);
assert.equal(stack.visible[0]?.lead.id, "lead-3");
assert.equal(stack.hiddenCount, 1);

const caught = alertFromCatchUp(
  lead({ status: "unassigned", assigned_to: null, passed_back_by: "pm-1", passed_back_by_name: "Alex Rivera" }),
  "admin-1",
  true,
);
assert.equal(caught?.kind, "passed_back");
assert.deepEqual(actionsForViewer("new_lead", false), ["call", "pass", "note"]);
assert.deepEqual(actionsForViewer("needs_rep", true), ["call", "assign"]);
assert.deepEqual(actionsForViewer("rep_note", true), ["got_it", "reassign"]);
assert.deepEqual(actionsForViewer("new_lead", true), ["call", "assign"]);
assert.deepEqual(actionsForViewer("needs_rep", false), []);
