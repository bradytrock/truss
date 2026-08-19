import { NextResponse } from "next/server";
import {
  listGoogleEvents,
  refreshGoogleAccessToken,
  type StoredGoogleTokens,
} from "@/lib/google-calendar";
import { readGoogleTokenCookie } from "@/lib/google-calendar-cookie";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

async function credentialsForStaff(staffId: string): Promise<StoredGoogleTokens | null> {
  const cookieTokens = await readGoogleTokenCookie();
  if (cookieTokens?.staffId === staffId) return cookieTokens;

  if (!isSupabaseConfigured()) return cookieTokens?.staffId === staffId ? cookieTokens : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("google_calendar_credentials", {
    target_staff_id: staffId,
  });
  if (error || !data || data.length === 0) return null;
  const row = data[0];
  return {
    staffId,
    googleEmail: row.google_email,
    calendarId: row.google_calendar_id,
    refreshToken: row.refresh_token ?? "",
    accessToken: row.access_token ?? "",
    expiresAt: row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0,
  };
}

async function accessToken(tokens: StoredGoogleTokens) {
  if (tokens.accessToken && tokens.expiresAt > Date.now() + 30_000) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) return tokens.accessToken;
  const refreshed = await refreshGoogleAccessToken(tokens.refreshToken);
  return refreshed.access_token ?? tokens.accessToken;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const staffId = url.searchParams.get("staffId");
  const timeMin = url.searchParams.get("timeMin");
  const timeMax = url.searchParams.get("timeMax");
  if (!staffId || !timeMin || !timeMax) {
    return NextResponse.json({ error: "staffId, timeMin, and timeMax are required." }, { status: 400 });
  }

  try {
    const tokens = await credentialsForStaff(staffId);
    if (!tokens) {
      return NextResponse.json({ events: [] });
    }
    const token = await accessToken(tokens);
    const events = await listGoogleEvents({
      accessToken: token,
      calendarId: tokens.calendarId,
      timeMin,
      timeMax,
    });
    return NextResponse.json({
      events: events.map((event) => ({
        ...event,
        staffId,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load Google events." },
      { status: 400 },
    );
  }
}
