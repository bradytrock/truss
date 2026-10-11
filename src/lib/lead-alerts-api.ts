import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ASSIGN_ERROR,
  NOTE_ERROR,
  PASSBACK_ERROR,
  snapshotFromRow,
  type LeadActivitySnapshot,
  type LeadSnapshot,
} from "@/lib/lead-alerts";
import type { Database } from "@/lib/supabase/database.types";

export type LeadClient = SupabaseClient<Database>;

export type RepOption = {
  id: string;
  fullName: string;
  initials: string;
};

export async function passLeadBack(
  supabase: LeadClient,
  input: { leadId: string; userId: string; fullName: string; reason: string; note: string },
) {
  const { error } = await supabase
    .from("leads")
    .update({
      assigned_to: null,
      status: "unassigned",
      passed_back_by: input.userId,
      passed_back_by_name: input.fullName,
      passback_reason: input.reason.trim() || null,
      handoff_note: input.note.trim() || null,
    })
    .eq("id", input.leadId);
  if (error) throw new Error(PASSBACK_ERROR);
}

export async function sendRepNote(
  supabase: LeadClient,
  input: { leadId: string; userId: string; fullName: string; body: string },
) {
  const body = input.body.trim();
  if (!body) throw new Error(NOTE_ERROR);
  const { error } = await supabase.from("lead_activity").insert({
    lead_id: input.leadId,
    user_id: input.userId,
    author_name: input.fullName,
    kind: "rep_note",
    body,
  });
  if (error) throw new Error(NOTE_ERROR);
}

export async function assignLead(
  supabase: LeadClient,
  input: { leadId: string; repId: string; note: string },
) {
  if (!input.repId) throw new Error(ASSIGN_ERROR);
  const { error } = await supabase
    .from("leads")
    .update({
      assigned_to: input.repId,
      status: "assigned",
      handoff_note: input.note.trim() || null,
      passed_back_by: null,
      passed_back_by_name: null,
      passback_reason: null,
    })
    .eq("id", input.leadId);
  if (error) throw new Error(ASSIGN_ERROR);
}

/** Anyone with a login in the company can take a lead. Locked seats stay off the list. */
export async function listLeadAssignees(supabase: LeadClient, companyId: string): Promise<RepOption[]> {
  const [profiles, seats] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, initials, staff_id")
      .eq("company_id", companyId)
      .order("full_name"),
    supabase.from("team_members").select("id, locked").eq("company_id", companyId),
  ]);
  if (profiles.error) throw profiles.error;
  if (seats.error) throw seats.error;
  const locked = new Set((seats.data ?? []).filter((row) => row.locked).map((row) => row.id));
  return (profiles.data ?? [])
    .filter((row) => !row.staff_id || !locked.has(row.staff_id))
    .map((row) => ({
      id: row.id,
      fullName: row.full_name,
      initials: row.initials,
    }));
}

export async function fetchLead(supabase: LeadClient, leadId: string): Promise<LeadSnapshot | null> {
  const { data, error } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (error || !data) return null;
  return snapshotFromRow(data);
}

export async function fetchUnassignedSince(supabase: LeadClient, companyId: string, sinceIso: string) {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "unassigned")
    .gt("updated_at", sinceIso)
    .order("updated_at", { ascending: false })
    .limit(25);
  if (error || !data) return [];
  return data.map(snapshotFromRow);
}

export async function fetchAssignedToMeSince(supabase: LeadClient, userId: string, sinceIso: string) {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("assigned_to", userId)
    .gt("updated_at", sinceIso)
    .order("updated_at", { ascending: false })
    .limit(25);
  if (error || !data) return [];
  return data.map(snapshotFromRow);
}

export async function fetchRepNotesSince(
  supabase: LeadClient,
  sinceIso: string,
): Promise<LeadActivitySnapshot[]> {
  const { data, error } = await supabase
    .from("lead_activity")
    .select("id, lead_id, user_id, author_name, kind, body, created_at")
    .eq("kind", "rep_note")
    .gt("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    lead_id: row.lead_id,
    user_id: row.user_id,
    author_name: row.author_name,
    kind: row.kind,
    body: row.body,
    created_at: row.created_at,
  }));
}
