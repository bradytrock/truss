import {
  refreshGoogleAccessToken,
  type StoredGmailTokens,
} from "@/lib/google-gmail";
import { readGmailTokenCookie } from "@/lib/google-gmail-cookie";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

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
