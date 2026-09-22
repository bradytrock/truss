import { NextResponse } from "next/server";
import { requireVoiceToken, readVoiceJson, voiceString, voiceUnauthorized } from "@/lib/voice-agent-http";
import { voiceIntake } from "@/lib/voice-agent-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = requireVoiceToken(request);
  if (!token) return voiceUnauthorized();
  const body = await readVoiceJson(request);
  const durationRaw = body.durationSeconds ?? body.duration_seconds;
  const durationSeconds =
    typeof durationRaw === "number" && Number.isFinite(durationRaw) ? durationRaw : null;
  const result = await voiceIntake(token, {
    phone: voiceString(body, "phone", "caller_phone", "from"),
    firstName: voiceString(body, "firstName", "first_name"),
    lastName: voiceString(body, "lastName", "last_name"),
    email: voiceString(body, "email"),
    street: voiceString(body, "street", "address"),
    city: voiceString(body, "city"),
    state: voiceString(body, "state") || "TX",
    postalCode: voiceString(body, "postalCode", "postal_code", "zip"),
    notes: voiceString(body, "notes", "reason", "summary"),
    transcript: voiceString(body, "transcript"),
    durationSeconds,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
