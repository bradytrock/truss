import { NextResponse } from "next/server";
import { requireCallingUser } from "@/lib/calls/server";
import { isMissingCalling, missingCallingMessage } from "@/lib/supabase/schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireCallingUser();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { data, error } = await auth.supabase.rpc("calling_incoming_for_staff", {
    p_staff_id: auth.staffId,
  });
  if (error) {
    return NextResponse.json(
      {
        error: isMissingCalling(error) ? missingCallingMessage() : error.message,
        missing: isMissingCalling(error),
        incoming: [],
      },
      { status: isMissingCalling(error) ? 200 : 400 },
    );
  }
  const row = (data ?? {}) as { ok?: boolean; incoming?: unknown[]; error?: string };
  if (row.ok === false) {
    return NextResponse.json({ error: row.error || "Could not load incoming calls." }, { status: 400 });
  }
  return NextResponse.json({ incoming: row.incoming ?? [] });
}
