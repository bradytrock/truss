import type { SupabaseClient } from "@supabase/supabase-js";
import {
  alertForRepNote,
  alertFromCatchUp,
  snapshotFromRow,
  type LeadActivitySnapshot,
  type LeadSnapshot,
} from "@/lib/lead-alerts";
import { inboxItem, mergeInbox, type InboxItem } from "@/lib/notification-inbox";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

function assignmentItem(lead: LeadSnapshot, userId: string) {
  const at = Date.parse(lead.updated_at);
  const alert = alertFromCatchUp(lead, userId, false, Number.isFinite(at) ? at : Date.now());
  return alert ? inboxItem(alert, lead.updated_at) : null;
}

function adminLeadItem(lead: LeadSnapshot, userId: string) {
  const at = Date.parse(lead.updated_at);
  const alert = alertFromCatchUp(lead, userId, true, Number.isFinite(at) ? at : Date.now());
  if (!alert || alert.kind === "new_lead" || alert.kind === "assigned_to_you") return null;
  return inboxItem(alert, lead.updated_at);
}

export async function loadNotificationInbox(
  supabase: Client,
  input: { userId: string; companyId: string; isAdmin: boolean },
): Promise<InboxItem[]> {
  const assigned = await supabase
    .from("leads")
    .select("*")
    .eq("assigned_to", input.userId)
    .order("updated_at", { ascending: false })
    .limit(40);
  if (assigned.error) throw assigned.error;

  const items: InboxItem[] = [];
  for (const row of assigned.data ?? []) {
    const item = assignmentItem(snapshotFromRow(row), input.userId);
    if (item) items.push(item);
  }

  if (!input.isAdmin) return mergeInbox(items);

  const open = await supabase
    .from("leads")
    .select("*")
    .eq("company_id", input.companyId)
    .eq("status", "unassigned")
    .order("updated_at", { ascending: false })
    .limit(40);
  if (open.error) throw open.error;
  for (const row of open.data ?? []) {
    const item = adminLeadItem(snapshotFromRow(row), input.userId);
    if (item) items.push(item);
  }

  const notes = await supabase
    .from("lead_activity")
    .select("id, lead_id, user_id, author_name, kind, body, created_at")
    .eq("kind", "rep_note")
    .order("created_at", { ascending: false })
    .limit(40);
  if (notes.error) throw notes.error;

  const activities = (notes.data ?? []).filter((row) => row.user_id !== input.userId);
  const leadIds = [...new Set(activities.map((row) => row.lead_id))];
  const leadsById = new Map<string, LeadSnapshot>();
  if (leadIds.length) {
    const leads = await supabase.from("leads").select("*").in("id", leadIds);
    if (leads.error) throw leads.error;
    for (const row of leads.data ?? []) {
      const lead = snapshotFromRow(row);
      if (lead.company_id === input.companyId) leadsById.set(lead.id, lead);
    }
  }

  for (const row of activities) {
    const lead = leadsById.get(row.lead_id);
    if (!lead) continue;
    const activity: LeadActivitySnapshot = {
      id: row.id,
      lead_id: row.lead_id,
      user_id: row.user_id,
      author_name: row.author_name,
      kind: row.kind,
      body: row.body,
      created_at: row.created_at,
    };
    const at = Date.parse(activity.created_at);
    const alert = alertForRepNote(activity, lead, input.userId, true, Number.isFinite(at) ? at : Date.now());
    if (!alert) continue;
    items.push(inboxItem(alert, activity.created_at, activity.created_at));
  }

  return mergeInbox(items);
}
