import { inviteSignupUrl } from "@/lib/accounts";
import { appOrigin } from "@/lib/app-origin";
import { loadProfileCompany } from "@/lib/eagleview-server";
import {
  canEmailInvite,
  inviteEmailAllowed,
  inviteEmailHtml,
  inviteEmailSubject,
  inviteEmailText,
  parseInviteEmailStaffIds,
  type InviteEmailSendResult,
} from "@/lib/invite-email";
import { formatResendFrom, isResendConfigured, resendStatus, sendResendEmail } from "@/lib/resend-mail";
import { createClient } from "@/lib/supabase/server";

const INVITE_EMAIL_CAP = 50;

export async function inviteEmailAuth() {
  const supabase = await createClient();
  const { user, profile, error } = await loadProfileCompany(supabase);
  if (!user || !profile?.company_id) {
    return { supabase, error: error || "Sign in to continue.", status: 401 as const };
  }
  if (profile.role !== "company_admin") {
    return { supabase, error: "Only a company admin can email invites.", status: 403 as const };
  }
  return { supabase, user, profile, error: null, status: 200 as const };
}

export function inviteEmailRouteStatus() {
  return resendStatus();
}

export async function sendStaffInviteEmails(body: Record<string, unknown>) {
  const staffIds = parseInviteEmailStaffIds(body);
  if (staffIds.length === 0) {
    return { error: "Pick at least one teammate to email.", status: 400 as const };
  }
  if (staffIds.length > INVITE_EMAIL_CAP) {
    return { error: `Email at most ${INVITE_EMAIL_CAP} invites at a time.`, status: 400 as const };
  }

  const auth = await inviteEmailAuth();
  if (auth.error || !auth.profile) {
    return { error: auth.error, status: auth.status };
  }
  const { supabase, user, profile } = auth;
  const companyId = profile.company_id;

  const [{ data: company }, { data: senderSeat }] = await Promise.all([
    supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
    profile.staff_id
      ? supabase.from("team_members").select("name, email").eq("id", profile.staff_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const companyName = company?.name?.trim() || "the company";
  const metaName =
    typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  const inviterName = senderSeat?.name?.trim() || metaName || "A teammate";
  const replyTo =
    (typeof senderSeat?.email === "string" && senderSeat.email.trim()) || user.email?.trim() || "";
  if (!canEmailInvite(replyTo)) {
    return {
      error: "Add an email on your People profile so replies have somewhere to go.",
      status: 400 as const,
    };
  }

  const origin = await appOrigin();
  const from = formatResendFrom({ senderName: String(inviterName), companyName });
  const results: InviteEmailSendResult[] = [];

  for (const staffId of staffIds) {
    const { data: seat, error: seatError } = await supabase
      .from("team_members")
      .select("id, name, title, email, locked")
      .eq("id", staffId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (seatError || !seat) {
      results.push({
        staffId,
        email: "",
        name: "",
        ok: false,
        error: seatError?.message || "That seat is not on this company.",
      });
      continue;
    }
    if (seat.locked) {
      results.push({
        staffId,
        email: seat.email,
        name: seat.name,
        ok: false,
        error: "Unlock this account before sending an invite.",
      });
      continue;
    }
    if (!canEmailInvite(seat.email)) {
      results.push({
        staffId,
        email: seat.email,
        name: seat.name,
        ok: false,
        error: "Add an email on this seat before sending an invite.",
      });
      continue;
    }

    const { data: invite, error: inviteError } = await supabase
      .from("account_invites")
      .select("token, email, expires_at")
      .eq("company_id", companyId)
      .eq("staff_id", staffId)
      .maybeSingle();
    if (inviteError || !invite?.token) {
      results.push({
        staffId,
        email: seat.email,
        name: seat.name,
        ok: false,
        error: inviteError?.message || "Create or refresh the invite before emailing it.",
      });
      continue;
    }
    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      results.push({
        staffId,
        email: seat.email,
        name: seat.name,
        ok: false,
        error: "That invite expired. Refresh it, then send again.",
      });
      continue;
    }

    const signupUrl = inviteSignupUrl(origin, invite.token);
    if (!inviteEmailAllowed(signupUrl, origin)) {
      results.push({
        staffId,
        email: seat.email,
        name: seat.name,
        ok: false,
        error: "Could not build a signup link for this app.",
      });
      continue;
    }

    const to = canEmailInvite(invite.email) ? invite.email.trim() : seat.email.trim();
    const payload = {
      company: companyName,
      seatName: seat.name,
      seatTitle: seat.title,
      inviterName: String(inviterName),
      signupUrl,
    };
    const sent = await sendResendEmail({
      to,
      subject: inviteEmailSubject(companyName),
      html: inviteEmailHtml(payload),
      text: inviteEmailText(payload),
      from,
      replyTo,
    });
    results.push({
      staffId,
      email: to,
      name: seat.name,
      ok: sent.ok,
      mocked: sent.ok ? sent.mocked : undefined,
      error: sent.ok ? undefined : sent.error,
    });
  }

  const sent = results.filter((row) => row.ok).length;
  const failed = results.length - sent;
  return {
    ok: failed === 0,
    configured: isResendConfigured(),
    sent,
    failed,
    results,
  };
}
