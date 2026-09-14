import { randomBytes } from "node:crypto";
import { appOrigin } from "@/lib/app-origin";
import { loadProfileCompany } from "@/lib/eagleview-server";
import {
  applyEmailCampaignMerge,
  campaignStaffCardUrl,
  EMAIL_CAMPAIGN_AUDIENCE_LABELS,
  EMAIL_CAMPAIGN_SEND_CAP,
  emailCampaignHtml,
  emailCampaignText,
  isEmailCampaignAudience,
  mapEmailCampaignRow,
  normalizeCampaignEmail,
  resolveEmailCampaignAudience,
  type EmailCampaignAudience,
  type EmailCampaignFilter,
  type EmailCampaignRecipient,
} from "@/lib/marketing/email-campaigns";
import { formatResendFrom, isResendConfigured, sendResendEmail } from "@/lib/resend-mail";
import { looksLikeEmail } from "@/lib/share-text";
import { mapCompany, mapContact, mapJob, mapStaff } from "@/lib/supabase/mappers";
import { createClient } from "@/lib/supabase/server";
import type { Contact, Job } from "@/lib/types";

export async function marketingCampaignAuth() {
  const supabase = await createClient();
  const { profile, error } = await loadProfileCompany(supabase);
  if (!profile?.company_id) {
    return { supabase, error: error || "Sign in to continue.", status: 401 as const };
  }
  return { supabase, profile, error: null, status: 200 as const };
}

export function parseAudienceInput(
  body: Record<string, unknown>,
): { error: string } | { audienceKind: EmailCampaignAudience; filter: EmailCampaignFilter } {
  const audienceKind = typeof body.audienceKind === "string" ? body.audienceKind : "";
  if (!isEmailCampaignAudience(audienceKind)) {
    return { error: "Pick a list: realtors, current clients, past clients, or a storm ZIP." };
  }
  const filter: EmailCampaignFilter = {
    city: typeof body.city === "string" ? body.city : "",
    zip: typeof body.zip === "string" ? body.zip : "",
    includePunch: Boolean(body.includePunch),
  };
  if (audienceKind === "storm" && !filter.city?.trim() && !filter.zip?.trim()) {
    return { error: "Add a city or ZIP so the storm list has somewhere to look." };
  }
  return { audienceKind, filter };
}

export async function loadCampaignBook(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ contacts: Contact[]; jobs: Job[]; error?: string }> {
  const [contactsRes, jobsRes] = await Promise.all([
    supabase.from("contacts").select("*"),
    supabase.from("jobs").select("*"),
  ]);
  if (contactsRes.error) return { contacts: [], jobs: [], error: contactsRes.error.message };
  if (jobsRes.error) return { contacts: [], jobs: [], error: jobsRes.error.message };
  return {
    contacts: (contactsRes.data ?? []).map(mapContact),
    jobs: (jobsRes.data ?? []).map(mapJob),
  };
}

export async function loadUnsubscribedEmails(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
) {
  const { data, error } = await supabase
    .from("email_unsubscribes")
    .select("email")
    .eq("company_id", companyId)
    .not("unsubscribed_at", "is", null);
  if (error) return { emails: new Set<string>(), error: error.message };
  return {
    emails: new Set((data ?? []).map((row) => normalizeCampaignEmail(row.email))),
    error: null,
  };
}

export async function previewCampaignAudience(input: {
  audienceKind: EmailCampaignAudience;
  filter: EmailCampaignFilter;
}) {
  const auth = await marketingCampaignAuth();
  if (!auth.profile) return { error: auth.error, status: auth.status };
  const book = await loadCampaignBook(auth.supabase);
  if (book.error) return { error: book.error, status: 400 as const };
  const unsub = await loadUnsubscribedEmails(auth.supabase, auth.profile.company_id);
  if (unsub.error) return { error: unsub.error, status: 400 as const };
  const resolved = resolveEmailCampaignAudience(input.audienceKind, book.contacts, book.jobs, input.filter);
  const recipients = resolved.filter((row) => !unsub.emails.has(row.email));
  const suppressed = resolved.length - recipients.length;
  return {
    status: 200 as const,
    audienceKind: input.audienceKind,
    total: recipients.length,
    suppressed,
    capped: Math.min(recipients.length, EMAIL_CAMPAIGN_SEND_CAP),
    cap: EMAIL_CAMPAIGN_SEND_CAP,
    recipients: recipients.slice(0, 40),
  };
}

async function ensureUnsubscribeToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  email: string,
) {
  const normalized = normalizeCampaignEmail(email);
  const { data: existing } = await supabase
    .from("email_unsubscribes")
    .select("token")
    .eq("company_id", companyId)
    .eq("email", normalized)
    .maybeSingle();
  if (existing?.token) return existing.token;
  const token = randomBytes(24).toString("hex");
  const { data, error } = await supabase
    .from("email_unsubscribes")
    .insert({ company_id: companyId, email: normalized, token })
    .select("token")
    .maybeSingle();
  if (error && !error.message.toLowerCase().includes("duplicate")) {
    throw new Error(error.message);
  }
  if (data?.token) return data.token;
  const { data: again } = await supabase
    .from("email_unsubscribes")
    .select("token")
    .eq("company_id", companyId)
    .eq("email", normalized)
    .maybeSingle();
  return again?.token || token;
}

export async function listEmailCampaigns() {
  const auth = await marketingCampaignAuth();
  if (!auth.profile) return { error: auth.error, status: auth.status };
  const { data, error } = await auth.supabase
    .from("email_campaigns")
    .select("*")
    .eq("company_id", auth.profile.company_id)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) return { error: error.message, status: 400 as const };
  return {
    status: 200 as const,
    campaigns: (data ?? []).map(mapEmailCampaignRow),
    configured: isResendConfigured(),
  };
}

export async function sendEmailCampaign(input: {
  name: string;
  audienceKind: EmailCampaignAudience;
  filter: EmailCampaignFilter;
  subject: string;
  bodyText: string;
  contactIds?: string[];
}) {
  const auth = await marketingCampaignAuth();
  if (!auth.profile) return { error: auth.error, status: auth.status };
  const { supabase, profile } = auth;

  const subjectTemplate = input.subject.replace(/[\r\n]+/g, " ").trim();
  const bodyTemplate = input.bodyText.trim();
  if (!subjectTemplate) return { error: "Add a subject before sending.", status: 400 as const };
  if (!bodyTemplate) return { error: "Write a message before sending.", status: 400 as const };

  const [{ data: companyRow }, { data: staffRow }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", profile.company_id).maybeSingle(),
    profile.staff_id
      ? supabase.from("team_members").select("*").eq("id", profile.staff_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!companyRow) return { error: "Could not load the company for this send.", status: 400 as const };
  const company = mapCompany(companyRow);
  const staff = staffRow ? mapStaff(staffRow) : null;
  const senderName = staff?.name.trim() || profile.full_name.trim() || company.name;
  const replyTo = staff?.email.trim() || "";
  if (!looksLikeEmail(replyTo)) {
    return {
      error: "Add an email on your profile (Settings → People or Profile). Replies go to that address.",
      status: 400 as const,
    };
  }

  const book = await loadCampaignBook(supabase);
  if (book.error) return { error: book.error, status: 400 as const };
  const unsub = await loadUnsubscribedEmails(supabase, profile.company_id);
  if (unsub.error) return { error: unsub.error, status: 400 as const };

  const allowedIds = new Set((input.contactIds ?? []).filter(Boolean));
  const resolved = resolveEmailCampaignAudience(
    input.audienceKind,
    book.contacts,
    book.jobs,
    input.filter,
  ).filter((row) => (allowedIds.size ? allowedIds.has(row.contactId) : true));
  const eligible = resolved.filter((row) => !unsub.emails.has(row.email));
  const skippedUnsubscribed = resolved.length - eligible.length;
  const recipients = eligible.slice(0, EMAIL_CAMPAIGN_SEND_CAP);
  const skippedCap = Math.max(0, eligible.length - recipients.length);
  if (recipients.length === 0) {
    return { error: "That list has nobody with an email who is still subscribed.", status: 400 as const };
  }

  const origin = await appOrigin();
  const staffCardUrl = campaignStaffCardUrl({
    companySlug: company.slug,
    staff,
    origin,
  });
  const from = formatResendFrom({ senderName, companyName: company.name });
  const logoUrl = [company.cardLogoUrl, company.logoUrl].find((url) => /^https?:\/\//i.test(url || "")) || "";
  const campaignName =
    input.name.trim() ||
    `${EMAIL_CAMPAIGN_AUDIENCE_LABELS[input.audienceKind]}${
      input.filter.city?.trim() ? ` · ${input.filter.city.trim()}` : ""
    }${input.filter.zip?.trim() ? ` ${input.filter.zip.trim()}` : ""}`;

  const { data: campaign, error: insertError } = await supabase
    .from("email_campaigns")
    .insert({
      company_id: profile.company_id,
      name: campaignName,
      audience_kind: input.audienceKind,
      audience_city: input.filter.city?.trim() || "",
      audience_zip: input.filter.zip?.trim() || "",
      include_punch: Boolean(input.filter.includePunch),
      subject: subjectTemplate,
      body_text: bodyTemplate,
      status: "sending",
      created_by_staff_id: profile.staff_id,
      created_by_name: senderName,
    })
    .select("*")
    .single();
  if (insertError || !campaign) {
    return {
      error: insertError?.message || "Could not save the campaign. Apply the email campaign migration first.",
      status: 400 as const,
    };
  }

  let sentCount = 0;
  let failedCount = 0;
  let mocked = false;
  const sendRows: Array<{
    company_id: string;
    campaign_id: string;
    contact_id: string | null;
    job_id: string | null;
    email: string;
    recipient_name: string;
    subject: string;
    status: string;
    error: string;
    resend_id: string;
  }> = [];

  for (const recipient of recipients) {
    const merge = {
      recipient,
      companyName: company.name,
      staffName: senderName,
      staffPhone: staff?.phone || company.phone,
      staffCardUrl,
    };
    const subject = applyEmailCampaignMerge(subjectTemplate, merge);
    const body = applyEmailCampaignMerge(bodyTemplate, merge);
    const token = await ensureUnsubscribeToken(supabase, profile.company_id, recipient.email);
    const unsubscribeUrl = `${origin}/unsubscribe/${token}`;
    const html = emailCampaignHtml({
      company: company.name,
      subject,
      body,
      staffName: senderName,
      staffTitle: staff?.title,
      staffPhone: staff?.phone || company.phone,
      staffEmail: replyTo,
      cardUrl: staffCardUrl,
      unsubscribeUrl,
      logoUrl,
    });
    const text = emailCampaignText({
      body,
      staffName: senderName,
      staffPhone: staff?.phone || company.phone,
      cardUrl: staffCardUrl,
      unsubscribeUrl,
    });
    const result = await sendResendEmail({ to: recipient.email, subject, html, text, from, replyTo });
    if (!result.ok) {
      failedCount += 1;
      sendRows.push({
        company_id: profile.company_id,
        campaign_id: campaign.id,
        contact_id: recipient.contactId,
        job_id: recipient.jobId,
        email: recipient.email,
        recipient_name: recipient.name,
        subject,
        status: "failed",
        error: result.error,
        resend_id: "",
      });
      continue;
    }
    sentCount += 1;
    if (result.mocked) mocked = true;
    sendRows.push({
      company_id: profile.company_id,
      campaign_id: campaign.id,
      contact_id: recipient.contactId,
      job_id: recipient.jobId,
      email: recipient.email,
      recipient_name: recipient.name,
      subject,
      status: result.mocked ? "mocked" : "sent",
      error: "",
      resend_id: result.id,
    });
  }

  if (sendRows.length) {
    await supabase.from("email_campaign_sends").insert(sendRows);
  }
  const skippedCount = skippedUnsubscribed + skippedCap;
  await supabase
    .from("email_campaigns")
    .update({
      status: failedCount && !sentCount ? "failed" : "sent",
      sent_count: sentCount,
      failed_count: failedCount,
      skipped_count: skippedCount,
      sent_at: new Date().toISOString(),
    })
    .eq("id", campaign.id);

  return {
    status: 200 as const,
    ok: true,
    mocked,
    configured: isResendConfigured() || !mocked,
    campaignId: campaign.id,
    sent: sentCount,
    failed: failedCount,
    skipped: skippedCount,
    capped: skippedCap,
    suppressed: skippedUnsubscribed,
  };
}

export type { EmailCampaignRecipient };
