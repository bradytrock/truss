import { NextResponse } from "next/server";
import {
  listRecentGmailMessages,
} from "@/lib/google-gmail";
import { gmailAccessToken, gmailCredentialsForStaff } from "@/lib/google-gmail-server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { addressesOnMessage, tagsFromAddresses } from "@/lib/job-emails";
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

    const byGmailId = new Map((existing ?? []).map((row) => [row.gmail_id, row]));

    const rows = parsed.map((message) => {
      const prior = byGmailId.get(message.gmailId);
      const tags = tagsFromAddresses(bookContacts, addressesOnMessage({
        fromEmail: message.fromEmail,
        toEmail: message.toEmail,
        ccEmail: message.ccEmail,
      }));
      const row: Database["public"]["Tables"]["gmail_messages"]["Insert"] = {
        company_id: accountRow.company_id,
        account_id: accountRow.id,
        gmail_id: message.gmailId,
        thread_id: message.threadId,
        from_name: message.fromName,
        from_email: message.fromEmail,
        to_email: message.toEmail,
        cc_email: message.ccEmail,
        subject: message.subject,
        snippet: message.snippet,
        body_text: message.bodyText,
        received_at: message.receivedAt,
        direction: message.direction,
        job_id: prior?.job_id ?? null,
        contact_id: prior?.contact_id ?? tags.contactId,
        related_contact_ids: prior?.related_contact_ids?.length
          ? prior.related_contact_ids
          : tags.relatedContactIds,
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
