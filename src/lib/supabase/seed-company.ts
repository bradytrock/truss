import type { SupabaseClient } from "@supabase/supabase-js";
import { wipeOperations } from "@/lib/supabase/ops-seed";
import { initialsFromName, type SeatRole } from "@/lib/types";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export type PreserveSignedInStaff = {
  userId: string;
  name: string;
  title: string;
  role: SeatRole;
  initials?: string;
};

async function ignoreMissing(
  error: { message?: string; code?: string } | null,
) {
  if (!error) return true;
  return (
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    (error.message ?? "").includes("schema cache") ||
    (error.message ?? "").includes("Could not find the")
  );
}

/** Wipe the company book and leave only the signed-in seat. Does not recreate sample people. */
export async function seedCompanyBook(
  supabase: Client,
  companyId: string,
  options?: { preserve?: PreserveSignedInStaff | null },
) {
  await wipeOperations(supabase, companyId);
  const optionalDeletes = [
    "account_invites",
    "calendar_shares",
    "calendar_accounts",
    "training_progress",
    "training_bulletins",
    "messages",
  ] as const;
  for (const table of optionalDeletes) {
    const { error } = await supabase.from(table).delete().eq("company_id", companyId);
    if (error && !(await ignoreMissing(error))) throw error;
  }
  const requiredDeletes = [
    "activities",
    "tasks",
    "jobs",
    "opportunities",
    "contacts",
    "clients",
    "team_members",
  ] as const;
  for (const table of requiredDeletes) {
    const { error } = await supabase.from(table).delete().eq("company_id", companyId);
    if (error) throw error;
  }
  await supabase.from("teams").delete().eq("company_id", companyId);

  const preserve = options?.preserve;
  if (!preserve?.name.trim()) return;

  const { data: preserved, error: preserveError } = await supabase
    .from("team_members")
    .insert({
      company_id: companyId,
      name: preserve.name.trim(),
      title: preserve.title.trim() || "Company admin",
      role: preserve.role || "company_admin",
      team_id: null,
      initials: preserve.initials || initialsFromName(preserve.name),
    })
    .select("id")
    .single();
  if (preserveError) throw preserveError;
  if (preserved && preserve.userId) {
    const { error: linkError } = await supabase
      .from("profiles")
      .update({ staff_id: preserved.id })
      .eq("id", preserve.userId);
    if (linkError && !(await ignoreMissing(linkError)) && !linkError.message.includes("staff_id")) {
      throw linkError;
    }
  }
}
