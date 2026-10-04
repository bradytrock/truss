import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { AssignRepPanel, NoteToAdminPanel, PassAlongPanel } from "./lead-alert-dialogs.tsx";
import { LeadAlertCard } from "./lead-alert-card.tsx";
import {
  QUICK_REP_NOTES,
  acceptAlert,
  alertForMyAssignmentInsert,
  alertForMyAssignmentUpdate,
  alertForRepNote,
  alertForUnassignedInsert,
  alertForUnassignedUpdate,
  emptyAlertMemory,
  snapshotFromRow,
  type LeadActivitySnapshot,
  type LeadSnapshot,
} from "@/lib/lead-alerts";

function lead(overrides: Partial<LeadSnapshot> = {}): LeadSnapshot {
  return snapshotFromRow({
    id: "lead-1",
    company_id: "co-1",
    opportunity_id: "opp-1",
    job_id: "job-1",
    status: "assigned",
    assigned_to: "pm-1",
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

const noop = () => {};
const now = Date.parse("2026-10-04T17:00:30.000Z");

function text(html: string) {
  return html
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&");
}

function card(alert: NonNullable<ReturnType<typeof alertForMyAssignmentInsert>>, coarse = false) {
  return renderToStaticMarkup(
    <LeadAlertCard
      alert={alert}
      now={now}
      coarse={coarse}
      isAdmin={alert.kind !== "new_lead" && alert.kind !== "assigned_to_you"}
      onDismiss={noop}
      onCalled={noop}
      onPass={noop}
      onNote={noop}
      onAssign={noop}
    />,
  );
}

const fresh = alertForMyAssignmentInsert(lead(), "pm-1", now)!;
const freshHtml = text(card(fresh));
assert.match(freshHtml, /New lead/);
assert.match(freshHtml, /Dana Alvarez/);
assert.match(freshHtml, /100 Main · Plano/);
assert.match(freshHtml, /Roofing · Website/);
assert.match(freshHtml, /href="\/jobs\?job=job-1"/);
assert.match(freshHtml, /href="tel:\+12145550100"/);
assert.match(freshHtml, />\(214\) 555-0100</);
assert.match(freshHtml, />Copy</);
assert.match(freshHtml, /Pass it along/);
assert.match(freshHtml, /Respond with note/);
assert.doesNotMatch(freshHtml, /Assign rep/);
assert.match(freshHtml, /just now/);
assert.match(freshHtml, /Dismiss alert/);

const touchHtml = text(card(fresh, true));
assert.match(touchHtml, />Call now</);
assert.doesNotMatch(touchHtml, />Copy</);

const noPhone = text(card(alertForMyAssignmentInsert(lead({ phone: "" }), "pm-1", now)!));
assert.match(noPhone, /disabled/);
assert.doesNotMatch(noPhone, /tel:/);

const assigned = alertForMyAssignmentUpdate(
  lead({ updated_at: "2026-10-04T17:10:00.000Z" }),
  { assigned_to: "admin-1" },
  "pm-1",
  now,
)!;
const assignedHtml = text(card(assigned));
assert.match(assignedHtml, /Lead assigned to you/);
assert.match(assignedHtml, /Respond with note/);
assert.doesNotMatch(assignedHtml, /Assign rep/);

const needsRep = alertForUnassignedInsert(
  lead({ status: "unassigned", assigned_to: null, updated_at: "2026-10-04T17:11:00.000Z" }),
  true,
  now,
)!;
const needsHtml = text(card(needsRep));
assert.match(needsHtml, /New lead needs a rep/);
assert.match(needsHtml, /Assign rep/);
assert.doesNotMatch(needsHtml, /Respond with note/);
assert.doesNotMatch(needsHtml, /Pass it along/);

const passed = alertForUnassignedUpdate(
  lead({
    status: "unassigned",
    assigned_to: null,
    passed_back_by: "pm-1",
    passed_back_by_name: "Alex Rivera",
    passback_reason: "Schedule is full",
    handoff_note: "Booked through Friday",
    updated_at: "2026-10-04T17:12:00.000Z",
  }),
  { status: "assigned" },
  true,
  now,
)!;
const passedHtml = text(card(passed));
assert.match(passedHtml, /Passed back by Alex Rivera/);
assert.match(passedHtml, /Schedule is full · "Booked through Friday"/);
assert.match(passedHtml, /Assign rep/);
assert.doesNotMatch(passedHtml, /Respond with note/);

const activity: LeadActivitySnapshot = {
  id: "note-1",
  lead_id: "lead-1",
  user_id: "pm-1",
  author_name: "Alex Rivera",
  kind: "rep_note",
  body: "I'll call them first thing tomorrow morning.",
  created_at: "2026-10-04T17:20:00.000Z",
};
const repNote = alertForRepNote(activity, lead(), "admin-1", true, now)!;
const noteHtml = text(card(repNote));
assert.match(noteHtml, /Note from Alex Rivera/);
assert.match(noteHtml, /I'll call them first thing tomorrow morning/);
assert.match(noteHtml, />Got it</);
assert.match(noteHtml, />Reassign</);
assert.doesNotMatch(noteHtml, /Respond with note/);
assert.doesNotMatch(noteHtml, /Pass it along/);

const passModal = text(renderToStaticMarkup(
  <PassAlongPanel alert={fresh} onClose={noop} onSubmit={async () => {}} />,
));
assert.match(passModal, /Pass it along/);
assert.match(passModal, /This lead goes back to your company admin/);
assert.match(passModal, /assign it to another rep/);
assert.match(passModal, /Schedule is full/);
assert.match(passModal, /Outside my area/);
assert.match(passModal, /Not the right fit/);
assert.match(passModal, /Note for your admin/);
assert.match(passModal, /Send to admin/);
assert.match(passModal, /Dana Alvarez/);

const noteModal = text(renderToStaticMarkup(
  <NoteToAdminPanel onClose={noop} onSubmit={async () => {}} />,
));
assert.match(noteModal, /Note to admin/);
assert.match(noteModal, /Your company admin gets this note\. The lead stays with you\./);
assert.match(noteModal, /Quick notes/);
assert.match(noteModal, new RegExp(QUICK_REP_NOTES[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(noteModal, />Send</);
assert.doesNotMatch(noteModal, /tel:/);
assert.doesNotMatch(noteModal, /mailto:/);

const assignModal = text(renderToStaticMarkup(
  <AssignRepPanel
    alert={passed}
    companyId="co-1"
    reps={[
      { id: "pm-1", fullName: "Alex Rivera", initials: "AR" },
      { id: "pm-2", fullName: "Priya Shah", initials: "PS" },
    ]}
    onClose={noop}
    onSubmit={async () => {}}
  />,
));
assert.match(assignModal, /Assign rep/);
assert.match(assignModal, /Passed back by Alex Rivera: Schedule is full/);
assert.match(assignModal, /Booked through Friday/);
assert.match(assignModal, /Priya Shah/);
assert.match(assignModal, />PS</);
assert.doesNotMatch(assignModal, />AR</);
assert.match(assignModal, /Note for the rep/);
assert.match(assignModal, />Assign</);

const once = acceptAlert(emptyAlertMemory(), fresh);
const twice = acceptAlert(once, fresh);
assert.equal(twice.queue.length, 1);
assert.equal(twice, once);
