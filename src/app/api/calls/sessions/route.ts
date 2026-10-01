import { NextResponse } from "next/server";
import { requireCallingUser } from "@/lib/calls/server";
import { isMissingCalling, missingCallingMessage } from "@/lib/supabase/schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireCallingUser();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { data, error } = await auth.supabase
    .from("call_sessions")
    .select("*")
    .eq("company_id", auth.companyId)
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json(
      {
        error: isMissingCalling(error) ? missingCallingMessage() : error.message,
        missing: isMissingCalling(error),
        sessions: [],
      },
      { status: isMissingCalling(error) ? 200 : 500 },
    );
  }

  return NextResponse.json({
    sessions: (data ?? []).map((row) => ({
      id: row.id,
      direction: row.direction,
      roomName: row.room_name,
      fromNumber: row.from_number,
      toNumber: row.to_number,
      status: row.status,
      queueId: row.queue_id,
      answeredStaffId: row.answered_staff_id,
      contactId: row.contact_id,
      jobId: row.job_id,
      opportunityId: row.opportunity_id,
      callerParticipantIdentity: row.caller_participant_identity,
      disposition: row.disposition,
      durationSeconds: row.duration_seconds,
      startedAt: row.started_at,
      answeredAt: row.answered_at,
      endedAt: row.ended_at,
    })),
  });
}
