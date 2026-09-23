import { NextResponse } from "next/server";
import { resolveSeatStaffId } from "@/lib/project-map-logic";
import { createClient } from "@/lib/supabase/server";
import type { SeatRole } from "@/lib/types";

export async function requireMapSeat() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in." }, { status: 401 }) };
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role, staff_id, full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.company_id) {
    return { error: NextResponse.json({ error: "No company on this seat." }, { status: 403 }) };
  }

  let staffId = (profile.staff_id as string | null)?.trim() ?? "";
  if (!staffId) {
    const { data: people } = await supabase
      .from("team_members")
      .select("id, name, email")
      .eq("company_id", profile.company_id);
    staffId = resolveSeatStaffId({
      profileStaffId: profile.staff_id,
      email: user.email,
      fullName: profile.full_name,
      roster: people ?? [],
    });
    if (staffId) {
      await supabase.from("profiles").update({ staff_id: staffId }).eq("id", user.id);
    }
  }

  return {
    supabase,
    companyId: profile.company_id as string,
    staffId,
    role: (profile.role ?? "project_manager") as SeatRole,
  };
}
