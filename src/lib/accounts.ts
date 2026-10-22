import type { SeatRole, StaffMember } from "@/lib/types";

export const ACCOUNT_MANAGEMENT_SQL = "supabase/migrations/20260820200000_account_management.sql";
export const INVITE_SIGNUP_SQL = "supabase/migrations/20260821010000_invite_signup.sql";
export const INVITE_USED_ONCE_SQL = "supabase/migrations/20260915210000_invite_used_once.sql";
export const BOOTSTRAP_SQL_RAW =
  "https://raw.githubusercontent.com/bradytrock/truss/main/supabase/bootstrap.sql";
export const INVITE_SIGNUP_SQL_RAW =
  "https://raw.githubusercontent.com/bradytrock/truss/main/supabase/migrations/20260821010000_invite_signup.sql";
export const INVITE_DAYS = 14;

export function missingAccountManagementMessage() {
  return `Run ${ACCOUNT_MANAGEMENT_SQL} in the SQL editor so you can invite, lock, and remove people.`;
}

export function inviteSignupPatchMessage() {
  return `The invite trigger is still blocking this login. In the Supabase SQL editor, paste the Raw file (not the GitHub page) ${INVITE_SIGNUP_SQL_RAW}, run it until it says Success, then sign up again with the email the invite was sent to.`;
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

export type SeatInviteStatus = "none" | "open" | "accepted" | "expired" | "used" | "declined";

export type SeatInviteFields = Pick<StaffMember, "inviteExpiresAt" | "inviteToken"> &
  Partial<Pick<StaffMember, "inviteUsedAt" | "inviteAcceptedAt" | "inviteDeclinedAt" | "signedIn">>;

/** Same order as invite_gate: a login or a used invite beats declined, expiry, and acceptance. */
export function seatInviteStatus(member: SeatInviteFields, now = Date.now()): SeatInviteStatus {
  if (member.signedIn || member.inviteUsedAt) {
    return member.inviteToken || member.inviteExpiresAt || member.inviteUsedAt ? "used" : "none";
  }
  if (member.inviteDeclinedAt) return "declined";
  if (!member.inviteToken && !member.inviteExpiresAt) return "none";
  if (member.inviteExpiresAt && new Date(member.inviteExpiresAt).getTime() <= now) return "expired";
  if (member.inviteAcceptedAt) return "accepted";
  return "open";
}

export function inviteIsPending(member: SeatInviteFields, now = Date.now()) {
  const status = seatInviteStatus(member, now);
  return status === "open" || status === "accepted";
}

export function inviteIsExpired(member: SeatInviteFields, now = Date.now()) {
  return seatInviteStatus(member, now) === "expired";
}

export function inviteLinkUsable(member: SeatInviteFields, now = Date.now()) {
  return Boolean(member.inviteToken) && inviteIsPending(member, now);
}

export function inviteCanRefresh(member: SeatInviteFields, now = Date.now()) {
  const status = seatInviteStatus(member, now);
  return status === "open" || status === "accepted" || status === "expired" || status === "declined";
}

export function staffStatusLabel(member: StaffMember, now = Date.now()) {
  if (member.locked) return "Locked";
  if (member.restricted) return "Restricted";
  const status = seatInviteStatus(member, now);
  if (status === "expired") return "Invite expired";
  if (status === "declined") return "Invite declined";
  if (status === "accepted") return "Invite accepted";
  if (status === "open") return "Invite pending";
  return "Active";
}

export type AccountInviteSnapshot = {
  staff_id: string;
  token?: string | null;
  expires_at?: string | null;
  used_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
};

/** Keep the historical invite row on the seat, and record whether it is still outstanding. */
export function attachAccountInvites<T extends StaffMember>(
  staff: T[],
  invites: AccountInviteSnapshot[],
  signedInStaffIds: Iterable<string> = [],
): T[] {
  const signedIn = new Set(signedInStaffIds);
  const byStaff = new Map<string, AccountInviteSnapshot>();
  for (const invite of invites) {
    if (!invite.staff_id || byStaff.has(invite.staff_id)) continue;
    byStaff.set(invite.staff_id, invite);
  }
  return staff.map((member) => {
    const invite = byStaff.get(member.id);
    const hasLogin = signedIn.has(member.id);
    if (!invite) {
      return hasLogin ? { ...member, signedIn: true } : member;
    }
    return {
      ...member,
      signedIn: hasLogin,
      inviteToken: invite.token ?? null,
      inviteExpiresAt: invite.expires_at ?? null,
      inviteUsedAt: invite.used_at ?? null,
      inviteAcceptedAt: invite.accepted_at ?? null,
      inviteDeclinedAt: invite.declined_at ?? null,
    };
  });
}

export function inviteSendBlockReason(
  invite: {
    token?: string | null;
    expires_at?: string | null;
    used_at?: string | null;
    declined_at?: string | null;
  },
  now = Date.now(),
) {
  if (!invite.token) return "Create or refresh the invite before emailing it.";
  if (invite.used_at) return "That invite was already used. Refresh it, then send again.";
  if (invite.declined_at) return "That invite was declined. Refresh it, then send again.";
  if (invite.expires_at && new Date(invite.expires_at).getTime() <= now) {
    return "That invite expired. Refresh it, then send again.";
  }
  return null;
}

export function defaultTitleForRole(role: SeatRole) {
  if (role === "company_admin") return "Company admin";
  if (role === "director") return "Director";
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
