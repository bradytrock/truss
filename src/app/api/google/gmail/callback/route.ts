import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  GMAIL_COOKIE,
  GMAIL_OAUTH_STATE,
  exchangeGmailCode,
  googleEmailForToken,
} from "@/lib/google-gmail";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const mailUrl = new URL("/mail", origin);

  if (err || !code || !stateRaw) {
    mailUrl.searchParams.set("gmail", "error");
    mailUrl.searchParams.set("reason", err || "missing_code");
    return NextResponse.redirect(mailUrl);
  }

  let staffId = "";
  try {
    const state = JSON.parse(Buffer.from(stateRaw, "base64url").toString()) as {
      nonce?: string;
      staffId?: string;
    };
    const store = await cookies();
    const nonce = store.get(GMAIL_OAUTH_STATE)?.value;
    store.delete(GMAIL_OAUTH_STATE);
    if (!nonce || nonce !== state.nonce || !state.staffId) {
      throw new Error("OAuth state mismatch.");
    }
    staffId = state.staffId;
  } catch {
    mailUrl.searchParams.set("gmail", "error");
    mailUrl.searchParams.set("reason", "state");
    return NextResponse.redirect(mailUrl);
  }

  try {
    const tokens = await exchangeGmailCode(code, origin);
    const email = await googleEmailForToken(tokens.access_token ?? "");
    const expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;
    let accountId = "";

    if (isSupabaseConfigured()) {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("save_gmail_tokens", {
        p_staff_id: staffId,
        p_google_email: email,
        p_refresh_token: tokens.refresh_token ?? "",
        p_access_token: tokens.access_token ?? "",
        p_token_expires_at: new Date(expiresAt).toISOString(),
      });
      if (error) throw error;
      accountId = typeof data === "string" ? data : "";
    }

    const payload = {
      staffId,
      accountId,
      googleEmail: email,
      refreshToken: tokens.refresh_token ?? "",
      accessToken: tokens.access_token ?? "",
      expiresAt,
    };
    const store = await cookies();
    store.set(GMAIL_COOKIE, JSON.stringify(payload), {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https"),
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    mailUrl.searchParams.set("gmail", "connected");
    mailUrl.searchParams.set("email", email);
    mailUrl.searchParams.set("staffId", staffId);
    return NextResponse.redirect(mailUrl);
  } catch (error) {
    mailUrl.searchParams.set("gmail", "error");
    mailUrl.searchParams.set(
      "reason",
      error instanceof Error ? error.message : "token_exchange",
    );
    return NextResponse.redirect(mailUrl);
  }
}
