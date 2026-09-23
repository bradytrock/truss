import { loadProfileCompany } from "@/lib/eagleview-server";
import {
  leadAssignEmailHtml,
  leadAssignEmailSubject,
  leadAssignEmailText,
  leadAssignNeedsEmail,
  leadAssignPropertyAddress,
  leadAssignRecipients,
  parseLeadAssignOpportunityId,
  parseVoiceLeadAssignContext,
  type LeadAssignFields,
  type LeadAssignNotifyResult,
  type LeadAssignRecipient,
  type LeadAssignStaff,
} from "@/lib/lead-assign-email";
import { formatResendFrom, isResendConfigured, sendResendEmail } from "@/lib/resend-mail";
import { looksLikeEmail } from "@/lib/share-text";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

function asStaff(row: {
  id: string;
  name: string | null;
  email: string | null;
  team_id: string | null;
  role: string | null;
  locked: boolean | null;
}): LeadAssignStaff {
  return {
    id: row.id,
    name: row.name ?? "",
    email: row.email ?? "",
    teamId: row.team_id,
    role: row.role ?? "",
    locked: Boolean(row.locked),
  };
}

export async function sendLeadAssignEmails(input: {
  fields: LeadAssignFields;
  recipients: LeadAssignRecipient[];
  companyName: string;
  replyTo: string;
}): Promise<LeadAssignNotifyResult> {
  if (input.recipients.length === 0) {
    return { ok: true, sent: 0, failed: 0, skipped: 1 };
  }
  const replyTo = input.replyTo.trim();
  if (!looksLikeEmail(replyTo)) {
    return {
      ok: false,
      sent: 0,
      failed: input.recipients.length,
      skipped: 0,
      error: "Add a company email in Settings so lead notices have a reply-to.",
    };
  }

  const from = formatResendFrom({
    senderName: "Office",
    companyName: input.companyName.trim() || "Truss",
  });
  const text = leadAssignEmailText(input.fields);
  const html = leadAssignEmailHtml(input.fields);
  let sent = 0;
  let failed = 0;

  for (const recipient of input.recipients) {
    const result = await sendResendEmail({
      to: recipient.email,
      subject: leadAssignEmailSubject(
        recipient.role,
        input.fields.assignedToName,
        input.fields.propertyAddress,
      ),
      text,
      html,
      from,
      replyTo,
    });
    if (result.ok) sent += 1;
    else failed += 1;
  }

  return { ok: failed === 0, sent, failed, skipped: 0 };
}

export async function sendLeadAssignEmailsForOpportunity(
  supabase: Client,
  input: {
    companyId: string;
    opportunityId: string;
    replyToFallback?: string;
  },
): Promise<LeadAssignNotifyResult> {
  const opportunityId = input.opportunityId.trim();
  if (!opportunityId) {
    return { ok: false, sent: 0, failed: 0, skipped: 1, error: "Missing lead." };
  }

  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunities")
    .select(
      "id, company_id, primary_contact_id, owner_staff_id, originator_staff_id, estimator, location, street, city, state, postal_code, notes",
    )
    .eq("id", opportunityId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (opportunityError) {
    return { ok: false, sent: 0, failed: 1, skipped: 0, error: opportunityError.message };
  }
  if (!opportunity) {
    return { ok: false, sent: 0, failed: 0, skipped: 1, error: "That lead is gone." };
  }

  const ownerId = opportunity.owner_staff_id?.trim() ?? "";
  if (
    !leadAssignNeedsEmail({
      ownerStaffId: ownerId,
      originatorStaffId: opportunity.originator_staff_id,
    })
  ) {
    return { ok: true, sent: 0, failed: 0, skipped: 1 };
  }

  const [{ data: company }, { data: staffRows }, { data: teamRows }, contactResult] = await Promise.all([
    supabase.from("companies").select("name, email").eq("id", input.companyId).maybeSingle(),
    supabase
      .from("team_members")
      .select("id, name, email, team_id, role, locked")
      .eq("company_id", input.companyId),
    supabase.from("teams").select("id, lead_staff_id").eq("company_id", input.companyId),
    opportunity.primary_contact_id
      ? supabase
          .from("contacts")
          .select("name, email, phone")
          .eq("id", opportunity.primary_contact_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const staff = (staffRows ?? []).map(asStaff);
  const assignee = staff.find((member) => member.id === ownerId);
  const recipients = leadAssignRecipients({
    assignee,
    staff,
    teams: (teamRows ?? []).map((team) => ({
      id: team.id,
      leadStaffId: team.lead_staff_id ?? "",
    })),
  });
  if (recipients.length === 0) {
    return { ok: true, sent: 0, failed: 0, skipped: 1 };
  }

  const contact = contactResult.data;
  const fields: LeadAssignFields = {
    homeownerName: contact?.name?.trim() ?? "",
    homeownerPhone: contact?.phone?.trim() ?? "",
    homeownerEmail: contact?.email?.trim() ?? "",
    propertyAddress: leadAssignPropertyAddress({
      street: opportunity.street,
      city: opportunity.city,
      state: opportunity.state,
      postalCode: opportunity.postal_code,
      location: opportunity.location,
    }),
    notes: opportunity.notes?.trim() ?? "",
    assignedToName: assignee?.name.trim() || opportunity.estimator?.trim() || "",
  };

  return sendLeadAssignEmails({
    fields,
    recipients,
    companyName: company?.name?.trim() || "Truss",
    replyTo:
      (looksLikeEmail(company?.email ?? "") ? company!.email.trim() : "") ||
      (looksLikeEmail(input.replyToFallback ?? "") ? input.replyToFallback!.trim() : ""),
  });
}

export async function sendVoiceLeadAssignEmails(
  supabase: Client,
  input: { token: string; opportunityId: string },
): Promise<LeadAssignNotifyResult> {
  const opportunityId = input.opportunityId.trim();
  const token = input.token.trim();
  if (!opportunityId || !token) {
    return { ok: false, sent: 0, failed: 0, skipped: 1, error: "Missing lead." };
  }
  const { data, error } = await supabase.rpc("voice_lead_assign_context", {
    p_token: token,
    p_opportunity_id: opportunityId,
  });
  if (error) {
    return { ok: false, sent: 0, failed: 1, skipped: 0, error: error.message };
  }
  const context = parseVoiceLeadAssignContext(data);
  if (!context) {
    return { ok: false, sent: 0, failed: 0, skipped: 1, error: "Could not load that lead." };
  }
  return sendLeadAssignEmails({
    fields: context.fields,
    recipients: leadAssignRecipients(context),
    companyName: context.companyName,
    replyTo: context.companyEmail,
  });
}

export async function notifyAssignedLeadFromRequest(body: Record<string, unknown>) {
  const opportunityId = parseLeadAssignOpportunityId(body);
  if (!opportunityId) {
    return { error: "Missing lead.", status: 400 as const, ok: false, sent: 0, failed: 0, skipped: 1 };
  }

  const supabase = await createClient();
  const { user, profile, error } = await loadProfileCompany(supabase);
  if (!user || !profile?.company_id) {
    return { error: error || "Sign in first.", status: 401 as const, ok: false, sent: 0, failed: 0, skipped: 0 };
  }

  const result = await sendLeadAssignEmailsForOpportunity(supabase, {
    companyId: profile.company_id,
    opportunityId,
    replyToFallback: user.email ?? "",
  });
  if (result.error && result.sent === 0 && result.failed > 0) {
    return { ...result, status: 502 as const };
  }
  if (result.error === "That lead is gone.") {
    return { ...result, status: 404 as const };
  }
  return { ...result, status: 200 as const, configured: isResendConfigured() };
}
