import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GCAL_OAUTH_STATE, googleAuthUrl, isGoogleOAuthConfigured } from "@/lib/google-calendar";
import { oauthReturnPath } from "@/lib/invite-onboarding";

export async function GET(request: Request) {
  if (!isGoogleOAuthConfigured()) {
    return NextResponse.json(
      { error: "Google Calendar OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
      { status: 400 },
    );
  }
  const url = new URL(request.url);
  const staffId = url.searchParams.get("staffId") || "";
  if (!staffId) {
    return NextResponse.json({ error: "Missing staffId." }, { status: 400 });
  }
  const origin = url.origin;
  const nonce = crypto.randomUUID();
  const next = oauthReturnPath(url.searchParams.get("next")) ?? "";
  const state = Buffer.from(JSON.stringify({ nonce, staffId, next })).toString("base64url");
  const store = await cookies();
  store.set(GCAL_OAUTH_STATE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https"),
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(googleAuthUrl({ origin, state }));
}
