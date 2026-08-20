import type { SupabaseClient } from "@supabase/supabase-js";
import { namesMatch } from "@/lib/seats";
import { isNorthlineDemoName, NORTHLINE_TEAMS } from "@/lib/types";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

function ignoreMissing(error: { message?: string; code?: string } | null) {
  if (!error) return true;
  return (
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    (error.message ?? "").includes("schema cache") ||
    (error.message ?? "").includes("Could not find the")
  );
}

async function reassign(
  supabase: Client,
  table: string,
  column: string,
  companyId: string,
  fromIds: string[],
  keepStaffId: string,
) {
  const { error } = await supabase
    .from(table)
    .update({ [column]: keepStaffId } as never)
    .eq("company_id", companyId)
    .in(column, fromIds);
  if (error && !ignoreMissing(error)) throw error;
}

export async function retireDemoStaff(
  supabase: Client,
  companyId: string,
  keep: { staffId: string; name: string },
) {
  const { data: members, error: listError } = await supabase
    .from("team_members")
    .select("id, name")
    .eq("company_id", companyId);
  if (listError) throw listError;

  const demoIds = (members ?? [])
    .filter(
      (member) =>
        isNorthlineDemoName(member.name) &&
        member.id !== keep.staffId &&
        !namesMatch(member.name, keep.name),
    )
    .map((member) => member.id);
  if (demoIds.length === 0) return false;

  await reassign(supabase, "contacts", "owner_staff_id", companyId, demoIds, keep.staffId);
  await reassign(supabase, "opportunities", "owner_staff_id", companyId, demoIds, keep.staffId);
  await reassign(supabase, "opportunities", "originator_staff_id", companyId, demoIds, keep.staffId);
  await reassign(supabase, "jobs", "owner_staff_id", companyId, demoIds, keep.staffId);
  await reassign(supabase, "teams", "lead_staff_id", companyId, demoIds, keep.staffId);

  const { error: shareOwners } = await supabase
    .from("calendar_shares")
    .delete()
    .eq("company_id", companyId)
    .in("owner_staff_id", demoIds);
  if (shareOwners && !ignoreMissing(shareOwners)) throw shareOwners;
  const { error: shareViewers } = await supabase
    .from("calendar_shares")
    .delete()
    .eq("company_id", companyId)
    .in("viewer_staff_id", demoIds);
  if (shareViewers && !ignoreMissing(shareViewers)) throw shareViewers;

  const { error: calError } = await supabase
    .from("calendar_accounts")
    .delete()
    .eq("company_id", companyId)
    .in("staff_id", demoIds);
  if (calError && !ignoreMissing(calError)) throw calError;

  const { error: trainingError } = await supabase
    .from("training_progress")
    .delete()
    .eq("company_id", companyId)
    .in("staff_id", demoIds);
  if (trainingError && !ignoreMissing(trainingError)) throw trainingError;

  const { error: deleteError } = await supabase.from("team_members").delete().in("id", demoIds);
  if (deleteError) throw deleteError;

  const seedTeamNames = new Set(NORTHLINE_TEAMS.map((team) => team.name.toLowerCase()));
  const { data: remaining } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("company_id", companyId);
  const usedTeams = new Set((remaining ?? []).map((row) => row.team_id).filter(Boolean));
  const { data: teams } = await supabase.from("teams").select("id, name").eq("company_id", companyId);
  const unusedSeed = (teams ?? []).filter(
    (team) => seedTeamNames.has(team.name.toLowerCase()) && !usedTeams.has(team.id),
  );
  if (unusedSeed.length > 0) {
    const { error: teamError } = await supabase
      .from("teams")
      .delete()
      .in(
        "id",
        unusedSeed.map((team) => team.id),
      );
    if (teamError && !ignoreMissing(teamError)) throw teamError;
  }

  return true;
}
