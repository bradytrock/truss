import { leadSourceLabel } from "@/lib/leads";
import { formatPhoneInput, toE164 } from "@/lib/phone";
import { PROJECT_TYPE_LABELS, type ProjectType } from "@/lib/types";

export const MAX_VISIBLE_ALERTS = 3;

export const PASSBACK_REASONS = ["Schedule is full", "Outside my area", "Not the right fit"] as const;

export const QUICK_REP_NOTES = [
  "I'm with a client and will call them within 20 minutes.",
  "I'm driving and will call them as soon as I stop.",
  "I'll call them first thing tomorrow morning.",
] as const;

export const PASS_ALONG_TITLE = "Pass it along";
export const PASS_ALONG_HELP = "This lead goes back to your company admin, who'll assign it to another rep.";
export const NOTE_TITLE = "Note to admin";
export const NOTE_HELP = "Your company admin gets this note. The lead stays with you.";
export const ASSIGN_TITLE = "Assign rep";

export const PASSBACK_ERROR = "Couldn't send this back to your admin. The lead is still yours; try again.";
export const NOTE_ERROR = "Couldn't send your note. Check your connection and try again.";
export const ASSIGN_ERROR = "Couldn't assign this lead. Try again.";

export type AlertKind = "new_lead" | "assigned_to_you" | "needs_rep" | "passed_back" | "rep_note";

export type LeadSnapshot = {
  id: string;
  company_id: string;
  opportunity_id: string | null;
  job_id: string | null;
  status: "unassigned" | "assigned";
  assigned_to: string | null;
  passed_back_by: string | null;
  passed_back_by_name: string;
  passback_reason: string;
  handoff_note: string;
  homeowner_name: string;
  street: string;
  city: string;
  service_type: string;
  source: string;
  phone: string;
  created_at: string;
  updated_at: string;
};

export type LeadActivitySnapshot = {
  id: string;
  lead_id: string;
  user_id: string;
  author_name: string;
  kind: string;
  body: string;
  created_at: string;
};

export type LeadAlert = {
  id: string;
  kind: AlertKind;
  title: string;
  lead: LeadSnapshot;
  noteId: string;
  noteBody: string;
  authorName: string;
  arrivedAt: number;
};

export type AlertMemory = {
  queue: LeadAlert[];
  stamps: string[];
};

type LeadRowInput = {
  id: string;
  company_id: string;
  opportunity_id?: string | null;
  job_id?: string | null;
  status?: string | null;
  assigned_to?: string | null;
  passed_back_by?: string | null;
  passed_back_by_name?: string | null;
  passback_reason?: string | null;
  handoff_note?: string | null;
  homeowner_name?: string | null;
  street?: string | null;
  city?: string | null;
  service_type?: string | null;
  source?: string | null;
  phone?: string | null;
  created_at: string;
  updated_at: string;
};

export function snapshotFromPayload(value: unknown): LeadSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.company_id !== "string") return null;
  const created = typeof row.created_at === "string" ? row.created_at : new Date().toISOString();
  const updated = typeof row.updated_at === "string" ? row.updated_at : created;
  return snapshotFromRow({
    id: row.id,
    company_id: row.company_id,
    opportunity_id: typeof row.opportunity_id === "string" ? row.opportunity_id : null,
    job_id: typeof row.job_id === "string" ? row.job_id : null,
    status: typeof row.status === "string" ? row.status : "unassigned",
    assigned_to: typeof row.assigned_to === "string" ? row.assigned_to : null,
    passed_back_by: typeof row.passed_back_by === "string" ? row.passed_back_by : null,
    passed_back_by_name: typeof row.passed_back_by_name === "string" ? row.passed_back_by_name : "",
    passback_reason: typeof row.passback_reason === "string" ? row.passback_reason : "",
    handoff_note: typeof row.handoff_note === "string" ? row.handoff_note : "",
    homeowner_name: typeof row.homeowner_name === "string" ? row.homeowner_name : "",
    street: typeof row.street === "string" ? row.street : "",
    city: typeof row.city === "string" ? row.city : "",
    service_type: typeof row.service_type === "string" ? row.service_type : "",
    source: typeof row.source === "string" ? row.source : "",
    phone: typeof row.phone === "string" ? row.phone : "",
    created_at: created,
    updated_at: updated,
  });
}

export function snapshotFromRow(row: LeadRowInput): LeadSnapshot {
  const status = row.status === "assigned" ? "assigned" : "unassigned";
  return {
    id: row.id,
    company_id: row.company_id,
    opportunity_id: row.opportunity_id ?? null,
    job_id: row.job_id ?? null,
    status,
    assigned_to: row.assigned_to ?? null,
    passed_back_by: row.passed_back_by ?? null,
    passed_back_by_name: row.passed_back_by_name?.trim() ?? "",
    passback_reason: row.passback_reason?.trim() ?? "",
    handoff_note: row.handoff_note?.trim() ?? "",
    homeowner_name: row.homeowner_name?.trim() ?? "",
    street: row.street?.trim() ?? "",
    city: row.city?.trim() ?? "",
    service_type: row.service_type?.trim() ?? "",
    source: row.source?.trim() ?? "",
    phone: row.phone?.trim() ?? "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function alertKey(kind: AlertKind, leadId: string, noteId = "") {
  return `${leadId}:${kind}:${noteId}`;
}

export function alertStamp(alert: Pick<LeadAlert, "id" | "lead" | "noteId" | "kind"> & { activityAt?: string }) {
  const version = alert.kind === "rep_note" ? alert.activityAt || alert.noteId : alert.lead.updated_at;
  return `${alert.id}@${version}`;
}

export function emptyAlertMemory(): AlertMemory {
  return { queue: [], stamps: [] };
}

export function acceptAlert(memory: AlertMemory, alert: LeadAlert, activityAt = ""): AlertMemory {
  const stamp = alertStamp({ ...alert, activityAt });
  if (memory.stamps.includes(stamp)) return memory;
  if (memory.queue.some((item) => item.id === alert.id)) return memory;
  const stamps = [...memory.stamps, stamp].slice(-200);
  return { queue: [alert, ...memory.queue], stamps };
}

export function dismissAlert(memory: AlertMemory, id: string): AlertMemory {
  if (!memory.queue.some((item) => item.id === id)) return memory;
  return { ...memory, queue: memory.queue.filter((item) => item.id !== id) };
}

export function stackAlerts(queue: LeadAlert[]) {
  return {
    visible: queue.slice(0, MAX_VISIBLE_ALERTS),
    hiddenCount: Math.max(0, queue.length - MAX_VISIBLE_ALERTS),
  };
}

function buildAlert(
  kind: AlertKind,
  lead: LeadSnapshot,
  extra?: { noteId?: string; noteBody?: string; authorName?: string; arrivedAt?: number },
): LeadAlert {
  const noteId = extra?.noteId ?? "";
  return {
    id: alertKey(kind, lead.id, noteId),
    kind,
    title: titleFor(kind, lead, extra?.authorName ?? ""),
    lead,
    noteId,
    noteBody: extra?.noteBody ?? "",
    authorName: extra?.authorName ?? "",
    arrivedAt: extra?.arrivedAt ?? Date.now(),
  };
}

function titleFor(kind: AlertKind, lead: LeadSnapshot, authorName: string) {
  if (kind === "new_lead") return "New lead";
  if (kind === "assigned_to_you") return "Lead assigned to you";
  if (kind === "needs_rep") return "New lead needs a rep";
  if (kind === "passed_back") return `Passed back by ${lead.passed_back_by_name || "a rep"}`;
  return `Note from ${authorName || "a rep"}`;
}

export function alertForMyAssignmentInsert(row: LeadSnapshot, me: string, arrivedAt = Date.now()) {
  if (!me || row.assigned_to !== me) return null;
  return buildAlert("new_lead", row, { arrivedAt });
}

export function alertForMyAssignmentUpdate(
  row: LeadSnapshot,
  old: Record<string, unknown> | null | undefined,
  me: string,
  arrivedAt = Date.now(),
) {
  if (!me || row.assigned_to !== me) return null;
  if (!old || !Object.prototype.hasOwnProperty.call(old, "assigned_to")) return null;
  if (old.assigned_to === me) return null;
  return buildAlert("assigned_to_you", row, { arrivedAt });
}

export function alertForUnassignedInsert(row: LeadSnapshot, isAdmin: boolean, arrivedAt = Date.now()) {
  if (!isAdmin || row.status !== "unassigned") return null;
  if (row.passed_back_by) return buildAlert("passed_back", row, { arrivedAt });
  return buildAlert("needs_rep", row, { arrivedAt });
}

export function alertForUnassignedUpdate(
  row: LeadSnapshot,
  old: Record<string, unknown> | null | undefined,
  isAdmin: boolean,
  arrivedAt = Date.now(),
) {
  if (!isAdmin || row.status !== "unassigned") return null;
  if (old && Object.prototype.hasOwnProperty.call(old, "status") && old.status === "unassigned") return null;
  if (row.passed_back_by) return buildAlert("passed_back", row, { arrivedAt });
  return buildAlert("needs_rep", row, { arrivedAt });
}

export function alertForRepNote(
  activity: LeadActivitySnapshot,
  lead: LeadSnapshot,
  me: string,
  isAdmin: boolean,
  arrivedAt = Date.now(),
) {
  if (!isAdmin) return null;
  if (activity.kind !== "rep_note") return null;
  if (!activity.user_id || activity.user_id === me) return null;
  if (activity.lead_id !== lead.id) return null;
  return buildAlert("rep_note", lead, {
    noteId: activity.id,
    noteBody: activity.body,
    authorName: activity.author_name,
    arrivedAt,
  });
}

export function alertFromCatchUp(row: LeadSnapshot, me: string, isAdmin: boolean, arrivedAt = Date.now()) {
  if (row.assigned_to === me && row.status === "assigned") {
    const created = Date.parse(row.created_at);
    const updated = Date.parse(row.updated_at);
    const fresh = Number.isFinite(created) && Number.isFinite(updated) && Math.abs(updated - created) < 2000;
    return buildAlert(fresh ? "new_lead" : "assigned_to_you", row, { arrivedAt });
  }
  if (!isAdmin || row.status !== "unassigned") return null;
  if (row.passed_back_by) return buildAlert("passed_back", row, { arrivedAt });
  return buildAlert("needs_rep", row, { arrivedAt });
}

export type AlertAction = "call" | "pass" | "note" | "assign" | "got_it" | "reassign";

export function alertActions(kind: AlertKind): AlertAction[] {
  if (kind === "new_lead" || kind === "assigned_to_you") return ["call", "pass", "note"];
  if (kind === "rep_note") return ["got_it", "reassign"];
  return ["call", "assign"];
}

export function actionsForViewer(kind: AlertKind, isAdmin: boolean): AlertAction[] {
  if (isAdmin) {
    if (kind === "rep_note") return ["got_it", "reassign"];
    return ["call", "assign"];
  }
  if (kind === "new_lead" || kind === "assigned_to_you") return ["call", "pass", "note"];
  return [];
}

export function serviceTypeLabel(value: string) {
  if (!value) return "";
  if (value in PROJECT_TYPE_LABELS) return PROJECT_TYPE_LABELS[value as ProjectType];
  return value;
}

export function leadPlaceLine(lead: Pick<LeadSnapshot, "street" | "city">) {
  return [lead.street, lead.city].filter(Boolean).join(" · ");
}

export function leadDetailLine(lead: Pick<LeadSnapshot, "service_type" | "source">) {
  return [serviceTypeLabel(lead.service_type), leadSourceLabel(lead.source)].filter(Boolean).join(" · ");
}

export function passbackSummary(lead: Pick<LeadSnapshot, "passback_reason" | "handoff_note">) {
  const reason = lead.passback_reason.trim();
  const note = lead.handoff_note.trim();
  if (reason && note) return `${reason} · "${note}"`;
  if (note) return `"${note}"`;
  return reason;
}

export function leadPhoneHref(phone: string) {
  const dial = toE164(phone);
  return dial ? `tel:${dial}` : "";
}

export function leadPhoneLabel(phone: string) {
  return formatPhoneInput(phone);
}

export function leadRecordHref(lead: Pick<LeadSnapshot, "job_id" | "opportunity_id">) {
  if (lead.job_id) return `/jobs?job=${encodeURIComponent(lead.job_id)}`;
  if (lead.opportunity_id) return `/opportunities/${lead.opportunity_id}`;
  return "";
}

export function announcementFor(alert: LeadAlert) {
  if (alert.kind === "rep_note") return `${alert.title}. ${alert.noteBody}`.trim();
  return [alert.title, alert.lead.homeowner_name, leadPlaceLine(alert.lead)].filter(Boolean).join(". ");
}

export function notificationBody(alert: LeadAlert) {
  if (alert.kind === "rep_note") return alert.noteBody;
  return [alert.lead.homeowner_name, leadPlaceLine(alert.lead).replaceAll(" · ", ", ")].filter(Boolean).join(" · ");
}

export function alertTimeLabel(arrivedAt: number, now = Date.now()) {
  const minutes = Math.floor(Math.max(0, now - arrivedAt) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export function cursorStorageKey(userId: string) {
  return `lead-alerts.cursor.${userId}`;
}

export function stampStorageKey(userId: string) {
  return `lead-alerts.stamps.${userId}`;
}

export function readCatchUpCursor(storage: Pick<Storage, "getItem"> | null, userId: string) {
  if (!storage) return "";
  return storage.getItem(cursorStorageKey(userId)) ?? "";
}

export function rememberCatchUpCursor(storage: Pick<Storage, "setItem"> | null, userId: string, iso: string) {
  storage?.setItem(cursorStorageKey(userId), iso);
}

/**
 * Browser Notification while the tab is in the background.
 * TODO: service-worker Web Push for when this tab is closed. That path should
 * reuse device_tokens (platform = 'web') and the notify-admins function.
 */
export function maybeBrowserNotify(alert: LeadAlert, onOpen: () => void) {
  if (typeof document === "undefined" || typeof Notification === "undefined") return;
  if (document.visibilityState !== "hidden") return;
  if (Notification.permission !== "granted") return;
  try {
    const notification = new Notification(alert.title, {
      body: notificationBody(alert),
      tag: alert.id,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
      onOpen();
    };
  } catch {
    // The browser can reject a Notification even after permission was granted.
  }
}
