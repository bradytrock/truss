import { NextResponse } from "next/server";
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
    .select("company_id, role, staff_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.company_id) {
    return { error: NextResponse.json({ error: "No company on this seat." }, { status: 403 }) };
  }
  return {
    supabase,
    companyId: profile.company_id as string,
    staffId: (profile.staff_id as string | null) ?? "",
    role: (profile.role ?? "project_manager") as SeatRole,
  };
}
