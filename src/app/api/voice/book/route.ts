import { NextResponse } from "next/server";
import { requireVoiceToken, readVoiceJson, voiceString, voiceUnauthorized } from "@/lib/voice-agent-http";
import { voiceBook } from "@/lib/voice-agent-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = requireVoiceToken(request);
  if (!token) return voiceUnauthorized();
  const body = await readVoiceJson(request);
  const result = await voiceBook(token, {
    title: voiceString(body, "title"),
    startsAt: voiceString(body, "startsAt", "starts_at", "start"),
    endsAt: voiceString(body, "endsAt", "ends_at", "end") || undefined,
    jobId: voiceString(body, "jobId", "job_id") || undefined,
    opportunityId: voiceString(body, "opportunityId", "opportunity_id") || undefined,
    kind: voiceString(body, "kind") || "site_walk",
    notes: voiceString(body, "notes"),
    location: voiceString(body, "location"),
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
