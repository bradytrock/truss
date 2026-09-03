import { NextResponse } from "next/server";
import { loadProfileCompany } from "@/lib/eagleview-server";
import { mapEagleviewOrder } from "@/lib/supabase/mappers";
import { createClient } from "@/lib/supabase/server";
import {
  isMissingEagleview,
  missingEagleviewMessage,
} from "@/lib/supabase/schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) {
    return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId")?.trim() || "";

  let query = supabase
    .from("eagleview_orders")
    .select("*")
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false });

  if (jobId) query = query.eq("job_id", jobId);

  const { data, error } = await query;
  if (error) {
    if (isMissingEagleview(error)) {
      return NextResponse.json({ orders: [], sql: missingEagleviewMessage() });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    orders: (data ?? []).map(mapEagleviewOrder),
  });
}
