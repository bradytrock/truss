import { NextResponse } from "next/server";
import {
  listRecentGmailMessages,
  refreshGoogleAccessToken,
  type StoredGmailTokens,
} from "@/lib/google-gmail";
import { readGmailTokenCookie } from "@/lib/google-gmail-cookie";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { normalizeEmail } from "@/lib/job-emails";
import type { Database } from "@/lib/supabase/database.types";

async function credentialsForStaff(staffId: string): Promise<StoredGmailTokens | null> {
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

async function accessToken(tokens: StoredGmailTokens) {
  if (tokens.accessToken && tokens.expiresAt > Date.now() + 30_000) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) return tokens.accessToken;
  const refreshed = await refreshGoogleAccessToken(tokens.refreshToken);
  return refreshed.access_token ?? tokens.accessToken;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { staffId?: string };
  const staffId = body.staffId || "";
  if (!staffId) {
    return NextResponse.json({ error: "Missing staffId." }, { status: 400 });
  }

  try {
    const tokens = await credentialsForStaff(staffId);
    if (!tokens?.accessToken && !tokens?.refreshToken) {
      return NextResponse.json({ messages: [], accountId: null, googleEmail: "" });
    }
    const token = await accessToken(tokens);
    const parsed = await listRecentGmailMessages({
      accessToken: token,
      linkedEmail: tokens.googleEmail,
    });

    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        messages: parsed.map((message) => ({
          id: crypto.randomUUID(),
          accountId: tokens.accountId || "",
          gmailId: message.gmailId,
          threadId: message.threadId,
          fromName: message.fromName,
          fromEmail: message.fromEmail,
          toEmail: message.toEmail,
          subject: message.subject,
          snippet: message.snippet,
          bodyText: message.bodyText,
          receivedAt: message.receivedAt,
          direction: message.direction,
          jobId: null,
          contactId: null,
        })),
        accountId: tokens.accountId || null,
        googleEmail: tokens.googleEmail,
      });
    }

    const supabase = await createClient();
    const { data: accountRow } = await supabase
      .from("gmail_accounts")
      .select("id, company_id, google_email")
      .eq("staff_id", staffId)
      .maybeSingle();
    if (!accountRow) {
      return NextResponse.json({ messages: [], accountId: null, googleEmail: tokens.googleEmail });
    }

    const [{ data: existing }, { data: contacts }] = await Promise.all([
      supabase
        .from("gmail_messages")
        .select("id, gmail_id, job_id, contact_id")
        .eq("account_id", accountRow.id),
      supabase.from("contacts").select("id, email").eq("company_id", accountRow.company_id),
    ]);

    const byGmailId = new Map((existing ?? []).map((row) => [row.gmail_id, row]));
    const contactByEmail = new Map(
      (contacts ?? [])
        .filter((row) => row.email)
        .map((row) => [normalizeEmail(row.email), row.id]),
    );

    const rows = parsed.map((message) => {
      const prior = byGmailId.get(message.gmailId);
      const counterpart = message.direction === "outbound" ? message.toEmail : message.fromEmail;
      const contactId = prior?.contact_id ?? contactByEmail.get(normalizeEmail(counterpart)) ?? null;
      const row: Database["public"]["Tables"]["gmail_messages"]["Insert"] = {
        company_id: accountRow.company_id,
        account_id: accountRow.id,
        gmail_id: message.gmailId,
        thread_id: message.threadId,
        from_name: message.fromName,
        from_email: message.fromEmail,
        to_email: message.toEmail,
        subject: message.subject,
        snippet: message.snippet,
        body_text: message.bodyText,
        received_at: message.receivedAt,
        direction: message.direction,
        job_id: prior?.job_id ?? null,
        contact_id: contactId,
      };
      if (prior?.id) row.id = prior.id;
      return row;
    });

    if (rows.length) {
      const { error } = await supabase.from("gmail_messages").upsert(rows, {
        onConflict: "account_id,gmail_id",
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    const { data: saved, error: loadError } = await supabase
      .from("gmail_messages")
      .select("*")
      .eq("account_id", accountRow.id)
      .order("received_at", { ascending: false });
    if (loadError) {
      return NextResponse.json({ error: loadError.message }, { status: 400 });
    }

    return NextResponse.json({
      messages: (saved ?? []).map((row) => ({
        id: row.id,
        accountId: row.account_id,
        gmailId: row.gmail_id,
        threadId: row.thread_id,
        fromName: row.from_name,
        fromEmail: row.from_email,
        toEmail: row.to_email,
        subject: row.subject,
        snippet: row.snippet,
        bodyText: row.body_text,
        receivedAt: row.received_at,
        direction: row.direction === "outbound" ? "outbound" : "inbound",
        jobId: row.job_id,
        contactId: row.contact_id,
      })),
      accountId: accountRow.id,
      googleEmail: accountRow.google_email,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not sync Gmail." },
      { status: 400 },
    );
  }
}
