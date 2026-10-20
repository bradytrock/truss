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
  appointmentInstants,
  appointmentRangeError,
  assignmentAlertSuppressed,
  defaultBookAppointment,
  dismissAlert,
  leadEditSeed,
  staleAssignmentAlertIds,
  emptyAlertMemory,
  leadDetailLine,
  leadPhoneHref,
  leadPlaceLine,
  leadServiceChoices,
  notificationBody,
  passbackSummary,
  snapshotFromRow,
  stackAlerts,
  suppressLeadAlerts,
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
    assigned_by: "admin-1",
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
assert.equal(
  alertForMyAssignmentInsert(lead({ assigned_to: "admin-1", assigned_by: "admin-1" }), "admin-1"),
  null,
);
assert.equal(alertFromCatchUp(lead({ assigned_to: "admin-1", assigned_by: "admin-1" }), "admin-1", true), null);
assert.equal(
  alertFromCatchUp(lead({ assigned_to: "admin-1", assigned_by: null, status: "assigned" }), "admin-1", true),
  null,
);
assert.ok(alertForMyAssignmentUpdate(lead({ assigned_by: "admin-1", updated_at: "2026-10-04T18:00:00.000Z" }), { assigned_to: null }, "pm-1"));
assert.equal(
  alertForMyAssignmentUpdate(
    lead({ assigned_to: "admin-1", assigned_by: "admin-1", updated_at: "2026-10-04T18:00:00.000Z" }),
    { assigned_to: null },
    "admin-1",
  ),
  null,
);
assert.deepEqual(
  staleAssignmentAlertIds(lead({ status: "assigned", assigned_to: "pm-1" }), "admin-1"),
  [alertKey("needs_rep", "lead-1"), alertKey("passed_back", "lead-1"), alertKey("new_lead", "lead-1"), alertKey("assigned_to_you", "lead-1")],
);
assert.equal(assignmentAlertSuppressed(lead({ assigned_to: "pm-1", assigned_by: "admin-1" }), "pm-1"), false);

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
assert.deepEqual(actionsForViewer("new_lead", false), ["call", "book", "update", "pass", "note"]);
assert.deepEqual(actionsForViewer("needs_rep", true), ["call", "assign"]);
assert.deepEqual(actionsForViewer("rep_note", true), ["got_it", "reassign"]);
assert.deepEqual(actionsForViewer("new_lead", true), ["call", "book", "update", "pass", "note"]);
assert.deepEqual(actionsForViewer("assigned_to_you", true), ["call", "book", "update", "pass", "note"]);
assert.deepEqual(actionsForViewer("needs_rep", false), []);

const draft = defaultBookAppointment(lead(), new Date(2026, 9, 4, 17, 0, 0));
assert.equal(draft.date, "2026-10-05");
assert.equal(draft.startTime, "09:00");
assert.equal(draft.endTime, "10:00");
assert.equal(draft.kind, "site_walk");
assert.equal(draft.title, "Site walk · Dana Alvarez");
assert.equal(draft.location, "100 Main, Plano");
assert.equal(appointmentRangeError("2026-10-05", "09:00", "10:00"), "");
assert.match(appointmentRangeError("2026-10-05", "10:00", "09:00"), /after the start/);
assert.match(appointmentRangeError("", "09:00", "10:00"), /date/);
const range = appointmentInstants({ date: "2026-10-05", startTime: "09:00", endTime: "10:00" });
assert.ok(range);
assert.equal(Date.parse(range.endsAt) - Date.parse(range.startsAt), 3_600_000);
assert.equal(leadServiceChoices("roofing").filter((item) => item === "roofing").length, 1);
assert.equal(leadServiceChoices("storm")[0], "storm");

const edited = leadEditSeed(lead(), {
  contact: { name: "Dana Alvarez", phone: "2145550100", email: "dana@example.com" },
  opportunity: { street: "100 Main", city: "Plano", state: "TX", postalCode: "75024", projectType: "roofing", nextStep: "Walk Thursday", notes: "Hail on the south slope" },
});
assert.equal(edited.email, "dana@example.com");
assert.equal(edited.state, "TX");
assert.equal(edited.nextStep, "Walk Thursday");
assert.equal(edited.notes, "Hail on the south slope");

const revised = lead({ updated_at: "2026-10-04T18:00:00.000Z" });
const quiet = suppressLeadAlerts(dismissAlert(first, inserted.id), revised);
assert.equal(quiet.queue.length, 0);
assert.equal(acceptAlert(quiet, alertForMyAssignmentInsert(revised, "pm-1", 400)!), quiet);
assert.equal(
  acceptAlert(quiet, alertForMyAssignmentUpdate(revised, { assigned_to: null }, "pm-1", 400)!).queue.length,
  0,
);
