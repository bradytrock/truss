import type { SeatRole, StaffMember } from "@/lib/types";

export const ACCOUNT_MANAGEMENT_SQL = "supabase/migrations/20260820200000_account_management.sql";
export const INVITE_SIGNUP_SQL = "supabase/migrations/20260821010000_invite_signup.sql";
export const BOOTSTRAP_SQL_RAW =
  "https://raw.githubusercontent.com/bradytrock/truss/main/supabase/bootstrap.sql";
export const INVITE_SIGNUP_SQL_RAW =
  "https://raw.githubusercontent.com/bradytrock/truss/main/supabase/migrations/20260821010000_invite_signup.sql";
export const INVITE_DAYS = 14;

export function missingAccountManagementMessage() {
  return `Run ${ACCOUNT_MANAGEMENT_SQL} in the SQL editor so you can invite, lock, and remove people.`;
}

export function inviteSignupPatchMessage() {
  return `Postgres blocked creating this login while joining from an invite. Paste the Raw SQL from ${INVITE_SIGNUP_SQL} in the Supabase SQL editor, run it, then sign up again with the email the invite was sent to.`;
}

export function isMissingAccountManagement(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    message.includes("schema cache") ||
    message.includes("Could not find the") ||
    message.includes("account_invites") ||
    message.includes("invite_preview") ||
    message.includes("claim_invite") ||
    message.includes("invite_expires_at")
  );
}

export function newInviteToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

export function inviteExpiry(from = new Date()) {
  const expires = new Date(from);
  expires.setDate(expires.getDate() + INVITE_DAYS);
  return expires.toISOString();
}

export function inviteSignupUrl(origin: string, token: string) {
  return `${origin.replace(/\/+$/, "")}/signup?invite=${encodeURIComponent(token)}`;
}

export function inviteIsPending(member: Pick<StaffMember, "inviteExpiresAt" | "inviteToken">) {
  return Boolean(member.inviteToken || member.inviteExpiresAt);
}

export function inviteIsExpired(member: Pick<StaffMember, "inviteExpiresAt">) {
  if (!member.inviteExpiresAt) return false;
  return new Date(member.inviteExpiresAt).getTime() <= Date.now();
}

export function staffStatusLabel(member: StaffMember) {
  if (member.locked) return "Locked";
  if (member.restricted) return "Restricted";
  if (inviteIsPending(member) && inviteIsExpired(member)) return "Invite expired";
  if (inviteIsPending(member)) return "Invited";
  return "Active";
}

export function defaultTitleForRole(role: SeatRole) {
  if (role === "company_admin") return "Company admin";
  if (role === "business_development") return "Business development";
  if (role === "team_lead") return "Team lead";
  if (role === "team_admin") return "Team administrator";
  if (role === "estimator") return "Estimator";
  if (role === "superintendent") return "Superintendent";
  if (role === "accountant") return "Controller";
  return "Project manager";
}

export function isActiveCompanyAdmin(member: Pick<StaffMember, "role" | "locked" | "restricted">) {
  return member.role === "company_admin" && !member.locked && !member.restricted;
}

export function remainingActiveAdmins(staff: StaffMember[], ignoreId?: string) {
  return staff.filter((member) => member.id !== ignoreId && isActiveCompanyAdmin(member)).length;
}

export function wouldLeaveNoAdmin(
  staff: StaffMember[],
  id: string,
  next: Pick<StaffMember, "role" | "locked" | "restricted">,
) {
  if (isActiveCompanyAdmin(next)) return false;
  return remainingActiveAdmins(staff, id) === 0;
}

export function isDuplicateStaffEmail(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "23505" || message.includes("team_members_company_email");
}

export function normalizeSeatEmail(value: string) {
  return value.trim().toLowerCase();
}
