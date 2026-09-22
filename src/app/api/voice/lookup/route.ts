import { NextResponse } from "next/server";
import { requireVoiceToken, readVoiceJson, voiceString, voiceUnauthorized } from "@/lib/voice-agent-http";
import { voiceLookup } from "@/lib/voice-agent-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = requireVoiceToken(request);
  if (!token) return voiceUnauthorized();
  const body = await readVoiceJson(request);
  const result = await voiceLookup(
    token,
    voiceString(body, "phone", "caller_phone", "from"),
    voiceString(body, "email"),
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
