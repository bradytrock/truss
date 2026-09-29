import {
  refreshGoogleAccessToken,
  type StoredGmailTokens,
} from "@/lib/google-gmail";
import { readGmailTokenCookie } from "@/lib/google-gmail-cookie";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/** Name on the seat, then the login profile, for the From display name. */
export async function staffSenderName(staffId: string) {
  const id = staffId.trim();
  if (!id || !isSupabaseConfigured()) return "";
  try {
    const supabase = await createClient();
    const { data: member } = await supabase.from("team_members").select("name").eq("id", id).maybeSingle();
    const seat = member?.name?.trim() ?? "";
    if (seat) return seat;
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("staff_id", id)
      .limit(1)
      .maybeSingle();
    return profile?.full_name?.trim() ?? "";
  } catch {
    return "";
  }
}

export async function gmailCredentialsForStaff(staffId: string): Promise<StoredGmailTokens | null> {
  const cookieTokens = await readGmailTokenCookie();
  if (cookieTokens?.staffId === staffId && cookieTokens.refreshToken) return cookieTokens;

  if (!isSupabaseConfigured()) {
    return cookieTokens?.staffId === staffId ? cookieTokens : null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gmail_credentials", {
    target_staff_id: staffId,
  });
  if (error || !data || data.length === 0) {
    return cookieTokens?.staffId === staffId ? cookieTokens : null;
  }
  const row = data[0];
  return {
    staffId,
    accountId: row.account_id,
    googleEmail: row.google_email,
    refreshToken: row.refresh_token ?? "",
    accessToken: row.access_token ?? "",
    expiresAt: row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0,
  };
}

export async function gmailAccessToken(tokens: StoredGmailTokens) {
  if (tokens.accessToken && tokens.expiresAt > Date.now() + 30_000) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) return tokens.accessToken;
  const refreshed = await refreshGoogleAccessToken(tokens.refreshToken);
  return refreshed.access_token ?? tokens.accessToken;
}
