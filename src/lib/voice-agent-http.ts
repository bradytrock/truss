import { NextResponse } from "next/server";
import { readVoiceToken } from "@/lib/voice-agent-server";

export function voiceUnauthorized() {
  return NextResponse.json({ ok: false, error: "Missing or unknown voice agent token." }, { status: 401 });
}

export async function readVoiceJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

export function voiceString(body: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function requireVoiceToken(request: Request) {
  return readVoiceToken(request);
}
