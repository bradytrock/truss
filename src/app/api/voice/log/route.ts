import { NextResponse } from "next/server";
import { requireVoiceToken, readVoiceJson, voiceString, voiceUnauthorized } from "@/lib/voice-agent-http";
import { voiceLog } from "@/lib/voice-agent-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = requireVoiceToken(request);
  if (!token) return voiceUnauthorized();
  const body = await readVoiceJson(request);
  const result = await voiceLog(token, {
    body: voiceString(body, "body", "notes", "transcript"),
    jobId: voiceString(body, "jobId", "job_id") || undefined,
    opportunityId: voiceString(body, "opportunityId", "opportunity_id") || undefined,
    type: voiceString(body, "type") || "call",
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
