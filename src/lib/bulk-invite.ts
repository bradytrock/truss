import { defaultTitleForRole, normalizeSeatEmail } from "@/lib/accounts";
import { parseDelimited } from "@/lib/catalog-csv";
import { looksLikeEmail } from "@/lib/share-text";
import { SEAT_ROLE_LABELS, SEAT_ROLES, type SeatRole, type Team } from "@/lib/types";

export const BULK_INVITE_START_ROWS = 5;
export const BULK_INVITE_MAX_ROWS = 50;
export const BULK_INVITE_DEFAULT_ROLE: SeatRole = "project_manager";

export const BULK_INVITE_CSV_HEADERS = ["name", "email", "role", "team", "title"] as const;

export const BULK_INVITE_CSV_TEMPLATE = `${BULK_INVITE_CSV_HEADERS.join(",")}
Alex Rivera,alex@company.com,Project manager,,Project manager
Jordan Lee,jordan@company.com,Estimator,Field,
Sam Patel,sam@company.com,Company admin,,Operations
`;

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

export type BulkInviteCsvIssue = {
  line: number;
  message: string;
};

export type BulkInviteCsvResult = {
  rows: BulkInviteDraft[];
  issues: BulkInviteCsvIssue[];
  /** Rows past the per-batch cap that were left out of `rows`. */
  skipped: number;
};

const NAME_HEADERS = new Set(["name", "full name", "person", "teammate", "employee"]);
const FIRST_NAME_HEADERS = new Set(["first", "first name", "given name"]);
const LAST_NAME_HEADERS = new Set(["last", "last name", "surname", "family name"]);
const EMAIL_HEADERS = new Set(["email", "e mail", "email address", "work email"]);
const ROLE_HEADERS = new Set(["role", "seat", "seat role", "permission", "access"]);
const TEAM_HEADERS = new Set(["team", "crew", "group", "team name"]);
const TITLE_HEADERS = new Set(["title", "job title", "position"]);

const ROLE_ALIASES: Record<string, SeatRole> = {
  admin: "company_admin",
  administrator: "company_admin",
  owner: "company_admin",
  "company administrator": "company_admin",
  bd: "business_development",
  "biz dev": "business_development",
  sales: "business_development",
  lead: "team_lead",
  "crew lead": "team_lead",
  "team administrator": "team_admin",
  "team admin": "team_admin",
  pm: "project_manager",
  "project mgr": "project_manager",
  rep: "project_manager",
  "sales rep": "project_manager",
  est: "estimator",
  super: "superintendent",
  supt: "superintendent",
  accountant: "accountant",
  accounting: "accountant",
  controller: "accountant",
  bookkeeper: "accountant",
  office: "accountant",
};

function normalizeCell(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function parseBulkInviteRole(raw: string): SeatRole | null {
  const key = normalizeCell(raw);
  if (!key) return BULK_INVITE_DEFAULT_ROLE;
  for (const role of SEAT_ROLES) {
    if (normalizeCell(role) === key || normalizeCell(SEAT_ROLE_LABELS[role]) === key) return role;
  }
  return ROLE_ALIASES[key] ?? null;
}

export function matchBulkInviteTeam(raw: string, teams: Team[]): Team | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const byId = teams.find((team) => team.id === trimmed);
  if (byId) return byId;
  const key = normalizeCell(trimmed);
  return teams.find((team) => normalizeCell(team.name) === key);
}

function columnIndex(headers: string[], aliases: Set<string>) {
  return headers.findIndex((header) => aliases.has(header));
}

/**
 * Turn a CSV (name, email, role, team, title) into grid rows. Unknown roles and teams
 * still load — with the default role or no team — so the admin can fix them in the grid,
 * and each one is reported as an issue with its line number.
 */
export function parseBulkInviteCsv(text: string, teams: Team[]): BulkInviteCsvResult {
  if (text.includes("\u0000")) {
    throw new Error("This looks like an Excel workbook. Save it as CSV (UTF-8) and upload that file.");
  }
  const table = parseDelimited(text);
  if (table.length === 0) throw new Error("The file is empty.");

  const first = (table[0] ?? []).map(normalizeCell);
  const named = {
    name: columnIndex(first, NAME_HEADERS),
    firstName: columnIndex(first, FIRST_NAME_HEADERS),
    lastName: columnIndex(first, LAST_NAME_HEADERS),
    email: columnIndex(first, EMAIL_HEADERS),
    role: columnIndex(first, ROLE_HEADERS),
    team: columnIndex(first, TEAM_HEADERS),
    title: columnIndex(first, TITLE_HEADERS),
  };
  const hasHeader = named.email >= 0 || named.name >= 0 || named.firstName >= 0;
  const cols = hasHeader
    ? named
    : { name: 0, firstName: -1, lastName: -1, email: 1, role: 2, team: 3, title: 4 };
  const body = hasHeader ? table.slice(1) : table;
  const startLine = hasHeader ? 2 : 1;

  const rows: BulkInviteDraft[] = [];
  const issues: BulkInviteCsvIssue[] = [];
  let skipped = 0;

  body.forEach((cells, index) => {
    const line = startLine + index;
    const cell = (at: number) => (at >= 0 ? (cells[at] ?? "") : "").trim();
    const name =
      cols.name >= 0
        ? cell(cols.name)
        : [cell(cols.firstName), cell(cols.lastName)].filter(Boolean).join(" ");
    const email = cell(cols.email);
    if (!name && !email) return;
    if (rows.length >= BULK_INVITE_MAX_ROWS) {
      skipped += 1;
      return;
    }

    const roleRaw = cell(cols.role);
    let role = parseBulkInviteRole(roleRaw);
    if (!role) {
      issues.push({
        line,
        message: `Role “${roleRaw}” is not one of ${SEAT_ROLES.map((item) => SEAT_ROLE_LABELS[item]).join(", ")}. Loaded as ${SEAT_ROLE_LABELS[BULK_INVITE_DEFAULT_ROLE]}.`,
      });
      role = BULK_INVITE_DEFAULT_ROLE;
    }

    const teamRaw = cell(cols.team);
    const team = matchBulkInviteTeam(teamRaw, teams);
    if (team === undefined) {
      issues.push({ line, message: `No team named “${teamRaw}”. Loaded without a team.` });
    }

    rows.push({
      key: crypto.randomUUID(),
      name,
      email,
      role,
      title: cell(cols.title) || defaultTitleForRole(role),
      teamId: team?.id ?? "",
    });
  });

  return { rows, issues, skipped };
}

/** Merge CSV rows into the grid, dropping untouched blank rows and keeping the batch under the cap. */
export function mergeBulkInviteRows(current: BulkInviteDraft[], incoming: BulkInviteDraft[]) {
  const kept = current.filter((row) => !isBlankBulkInviteRow(row));
  const room = Math.max(0, BULK_INVITE_MAX_ROWS - kept.length);
  const added = incoming.slice(0, room);
  return { rows: [...kept, ...added], skipped: incoming.length - added.length };
}
