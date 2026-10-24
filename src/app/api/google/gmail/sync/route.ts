import { NextResponse } from "next/server";
import {
  listRecentGmailMessages,
} from "@/lib/google-gmail";
import { gmailAccessToken, gmailCredentialsForStaff } from "@/lib/google-gmail-server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { buildGmailSyncRows, gmailSyncUpsertBatches } from "@/lib/gmail-sync";
import type { Database } from "@/lib/supabase/database.types";

function mapRow(row: Database["public"]["Tables"]["gmail_messages"]["Row"]) {
  return {
    id: row.id,
    accountId: row.account_id,
    gmailId: row.gmail_id,
    threadId: row.thread_id,
    fromName: row.from_name,
    fromEmail: row.from_email,
    toEmail: row.to_email,
    ccEmail: "cc_email" in row ? String(row.cc_email ?? "") : "",
    subject: row.subject,
    snippet: row.snippet,
    bodyText: row.body_text,
    receivedAt: row.received_at,
    direction: row.direction === "outbound" ? "outbound" : "inbound",
    jobId: row.job_id,
    contactId: row.contact_id,
    relatedContactIds: Array.isArray((row as { related_contact_ids?: string[] }).related_contact_ids)
      ? ((row as { related_contact_ids?: string[] }).related_contact_ids ?? [])
      : [],
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { staffId?: string };
  const staffId = body.staffId || "";
  if (!staffId) {
    return NextResponse.json({ error: "Missing staffId." }, { status: 400 });
  }

  try {
    const tokens = await gmailCredentialsForStaff(staffId);
    if (!tokens?.accessToken && !tokens?.refreshToken) {
      return NextResponse.json({ messages: [], accountId: null, googleEmail: "" });
    }
    const token = await gmailAccessToken(tokens);
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
          ccEmail: message.ccEmail,
          subject: message.subject,
          snippet: message.snippet,
          bodyText: message.bodyText,
          receivedAt: message.receivedAt,
          direction: message.direction,
          jobId: null,
          contactId: null,
          relatedContactIds: [] as string[],
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
        .select("id, gmail_id, job_id, contact_id, related_contact_ids")
        .eq("account_id", accountRow.id),
      supabase.from("contacts").select("id, email, name, title, is_referral_partner").eq("company_id", accountRow.company_id),
    ]);

    const bookContacts = (contacts ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      title: row.title,
      isReferralPartner: Boolean(row.is_referral_partner),
    }));

    const rows = buildGmailSyncRows({
      companyId: accountRow.company_id,
      accountId: accountRow.id,
      messages: parsed,
      existing: existing ?? [],
      contacts: bookContacts,
    });
    const { updates, inserts } = gmailSyncUpsertBatches(
      rows,
      new Set((existing ?? []).map((row) => row.gmail_id)),
    );

    if (updates.length) {
      const { error } = await supabase.from("gmail_messages").upsert(updates, {
        onConflict: "account_id,gmail_id",
        defaultToNull: false,
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    if (inserts.length) {
      const { error } = await supabase.from("gmail_messages").upsert(inserts, {
        onConflict: "account_id,gmail_id",
        defaultToNull: false,
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
      messages: (saved ?? []).map(mapRow),
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
