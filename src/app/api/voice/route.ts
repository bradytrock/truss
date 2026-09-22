import { NextResponse } from "next/server";
import { voiceToolPaths } from "@/lib/voice-agent";

export const runtime = "nodejs";

/** ElevenLabs tool catalog for this host. */
export async function GET() {
  const paths = voiceToolPaths();
  return NextResponse.json({
    tools: [
      {
        name: "lookup_caller",
        method: "POST",
        path: paths.lookup,
        description: "Look up a caller by phone before opening a lead. Does not write.",
      },
      {
        name: "take_missed_call",
        method: "POST",
        path: paths.intake,
        description:
          "Log a missed call. Attaches to an open job when one exists (notifies that PM, no new card). Otherwise opens a phone-seed lead on the owning PM. Never texts the homeowner.",
      },
      {
        name: "book_appointment",
        method: "POST",
        path: paths.book,
        description: "Book a site walk or meeting on the called project manager's calendar and log it on the job.",
      },
      {
        name: "log_activity",
        method: "POST",
        path: paths.log,
        description: "Write more call notes on the job or opportunity already referenced.",
      },
    ],
  });
}
