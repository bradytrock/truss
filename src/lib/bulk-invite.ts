import { defaultTitleForRole, normalizeSeatEmail } from "@/lib/accounts";
import { looksLikeEmail } from "@/lib/share-text";
import { SEAT_ROLES, type SeatRole } from "@/lib/types";

export const BULK_INVITE_START_ROWS = 5;
export const BULK_INVITE_MAX_ROWS = 50;

export type BulkInviteDraft = {
  key: string;
  name: string;
  email: string;
  role: SeatRole;
  title: string;
  teamId: string;
};

export type BulkInviteReady = {
  key: string;
  name: string;
  email: string;
  role: SeatRole;
  title: string;
  teamId: string;
};

export type BulkInviteIssue = {
  key: string;
  message: string;
};

export function emptyBulkInviteRow(role: SeatRole = "project_manager", teamId = ""): BulkInviteDraft {
  return {
    key: crypto.randomUUID(),
    name: "",
    email: "",
    role,
    title: defaultTitleForRole(role),
    teamId,
  };
}

export function emptyBulkInviteRows(count = BULK_INVITE_START_ROWS): BulkInviteDraft[] {
  return Array.from({ length: count }, () => emptyBulkInviteRow());
}

export function isBlankBulkInviteRow(row: BulkInviteDraft) {
  return !row.name.trim() && !row.email.trim();
}

export function parseBulkInviteRows(
  rows: BulkInviteDraft[],
  existingEmails: string[],
): { ready: BulkInviteReady[]; issues: BulkInviteIssue[] } {
  const taken = new Set(existingEmails.map((email) => normalizeSeatEmail(email)).filter(Boolean));
  const seen = new Set<string>();
  const ready: BulkInviteReady[] = [];
  const issues: BulkInviteIssue[] = [];

  for (const row of rows) {
    if (isBlankBulkInviteRow(row)) continue;
    const name = row.name.trim();
    const email = normalizeSeatEmail(row.email);
    if (!name) {
      issues.push({ key: row.key, message: "Add a name." });
      continue;
    }
    if (!email) {
      issues.push({ key: row.key, message: "Add the email this invite will go to." });
      continue;
    }
    if (!looksLikeEmail(email)) {
      issues.push({ key: row.key, message: "That email does not look right." });
      continue;
    }
    if (taken.has(email) || seen.has(email)) {
      issues.push({ key: row.key, message: "That email is already on this list or this company." });
      continue;
    }
    if (!SEAT_ROLES.includes(row.role)) {
      issues.push({ key: row.key, message: "Pick a role." });
      continue;
    }
    seen.add(email);
    ready.push({
      key: row.key,
      name,
      email,
      role: row.role,
      title: row.title.trim() || defaultTitleForRole(row.role),
      teamId: row.teamId.trim(),
    });
  }

  if (ready.length > BULK_INVITE_MAX_ROWS) {
    return {
      ready: [],
      issues: [{ key: rows[0]?.key ?? "cap", message: `Invite at most ${BULK_INVITE_MAX_ROWS} people at a time.` }],
    };
  }

  return { ready, issues };
}
