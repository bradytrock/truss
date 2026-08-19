import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  GCAL_COOKIE,
  GCAL_OAUTH_STATE,
  exchangeGoogleCode,
  googleEmailForToken,
} from "@/lib/google-calendar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const calendarUrl = new URL("/calendar", origin);

  if (err || !code || !stateRaw) {
    calendarUrl.searchParams.set("google", "error");
    calendarUrl.searchParams.set("reason", err || "missing_code");
    return NextResponse.redirect(calendarUrl);
  }

  let staffId = "";
  try {
    const state = JSON.parse(Buffer.from(stateRaw, "base64url").toString()) as {
      nonce?: string;
      staffId?: string;
    };
    const store = await cookies();
    const nonce = store.get(GCAL_OAUTH_STATE)?.value;
    store.delete(GCAL_OAUTH_STATE);
    if (!nonce || nonce !== state.nonce || !state.staffId) {
      throw new Error("OAuth state mismatch.");
    }
    staffId = state.staffId;
  } catch {
    calendarUrl.searchParams.set("google", "error");
    calendarUrl.searchParams.set("reason", "state");
    return NextResponse.redirect(calendarUrl);
  }

  try {
    const tokens = await exchangeGoogleCode(code, origin);
    const email = await googleEmailForToken(tokens.access_token ?? "");
    const expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;
    const payload = {
      staffId,
      googleEmail: email,
      calendarId: "primary",
      refreshToken: tokens.refresh_token ?? "",
      accessToken: tokens.access_token ?? "",
      expiresAt,
    };

    if (isSupabaseConfigured()) {
      const supabase = await createClient();
      const { error } = await supabase.rpc("save_google_calendar_tokens", {
        p_staff_id: staffId,
        p_google_email: email,
        p_calendar_id: "primary",
        p_refresh_token: tokens.refresh_token ?? "",
        p_access_token: tokens.access_token ?? "",
        p_token_expires_at: new Date(expiresAt).toISOString(),
      });
      if (error) throw error;
    } else {
      const store = await cookies();
      store.set(GCAL_COOKIE, JSON.stringify(payload), {
        httpOnly: true,
        sameSite: "lax",
        secure: origin.startsWith("https"),
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    calendarUrl.searchParams.set("google", "connected");
    calendarUrl.searchParams.set("email", email);
    calendarUrl.searchParams.set("staffId", staffId);
    return NextResponse.redirect(calendarUrl);
  } catch (error) {
    calendarUrl.searchParams.set("google", "error");
    calendarUrl.searchParams.set(
      "reason",
      error instanceof Error ? error.message : "token_exchange",
    );
    return NextResponse.redirect(calendarUrl);
  }
}
