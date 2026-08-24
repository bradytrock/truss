import type { CalendarAccount, CalendarShare, StaffMember, Team } from "@/lib/types";

const CALENDAR_COLORS = [
  "#9a3412",
  "#1e3a5f",
  "#3f6212",
  "#854d0e",
  "#6b21a8",
  "#0f766e",
  "#9f1239",
  "#164e63",
];

export function calendarColor(staffId: string) {
  let hash = 0;
  for (const char of staffId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CALENDAR_COLORS[hash % CALENDAR_COLORS.length] ?? CALENDAR_COLORS[0];
}

export function demoGoogleEmail(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(".");
  return `${slug || "crew"}@gmail.com`;
}

export function canSeeStaffCalendar(
  viewer: StaffMember,
  owner: StaffMember,
  account: CalendarAccount | undefined,
  shares: CalendarShare[],
) {
  if (viewer.id === owner.id) return true;
  if (viewer.role === "company_admin") return true;
  if (!account?.linked) return false;
  if (
    account.shareWithTeam &&
    viewer.teamId &&
    owner.teamId &&
    viewer.teamId === owner.teamId
  ) {
    return true;
  }
  return shares.some(
    (share) => share.ownerStaffId === owner.id && share.viewerStaffId === viewer.id,
  );
}

export function visibleCalendarStaff(
  viewer: StaffMember | undefined,
  staff: StaffMember[],
  accounts: CalendarAccount[],
  shares: CalendarShare[],
) {
  if (!viewer) return [];
  return staff.filter((member) => {
    const account = accounts.find((item) => item.staffId === member.id);
    return canSeeStaffCalendar(viewer, member, account, shares);
  });
}

export function calendarShareSummary(
  owner: StaffMember,
  account: CalendarAccount | undefined,
  shares: CalendarShare[],
  staff: StaffMember[],
  teams: Team[],
) {
  if (!account?.linked) return "Not linked";
  const names: string[] = [];
  if (account.shareWithTeam && owner.teamId) {
    const team = teams.find((item) => item.id === owner.teamId);
    names.push(team ? `Team · ${team.name}` : "Team");
  }
  for (const share of shares.filter((item) => item.ownerStaffId === owner.id)) {
    const member = staff.find((item) => item.id === share.viewerStaffId);
    if (member) names.push(member.name);
  }
  if (names.length === 0) return "Private · company admin can still see it";
  return `Shared with ${names.join(", ")}`;
}

export const CALENDAR_STORAGE_KEY = "theroofingcrm.calendar";
const CALENDAR_STORAGE_KEY_LEGACY = "truss.calendar";

export function readLocalCalendar(seed: {
  calendarAccounts: CalendarAccount[];
  calendarShares: CalendarShare[];
}) {
  try {
    const raw =
      window.localStorage.getItem(CALENDAR_STORAGE_KEY) ??
      window.localStorage.getItem(CALENDAR_STORAGE_KEY_LEGACY);
    if (!raw) return seed;
    const parsed = JSON.parse(raw) as {
      calendarAccounts?: CalendarAccount[];
      calendarShares?: CalendarShare[];
    };
    const byStaff = new Map(
      (parsed.calendarAccounts ?? []).map((account) => [account.staffId, account]),
    );
    return {
      calendarAccounts: seed.calendarAccounts.map(
        (account) => byStaff.get(account.staffId) ?? account,
      ).concat(
        (parsed.calendarAccounts ?? []).filter(
          (account) => !seed.calendarAccounts.some((item) => item.staffId === account.staffId),
        ),
      ),
      calendarShares: parsed.calendarShares ?? seed.calendarShares,
    };
  } catch {
    return seed;
  }
}

export function writeLocalCalendar(value: {
  calendarAccounts: CalendarAccount[];
  calendarShares: CalendarShare[];
}) {
  try {
    window.localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

export function clearLocalCalendar() {
  try {
    window.localStorage.removeItem(CALENDAR_STORAGE_KEY);
    window.localStorage.removeItem(CALENDAR_STORAGE_KEY_LEGACY);
  } catch {
    // ignore
  }
}

export function accountForStaff(
  accounts: CalendarAccount[],
  staffId: string,
): CalendarAccount {
  return (
    accounts.find((account) => account.staffId === staffId) ?? {
      staffId,
      googleEmail: "",
      calendarId: "primary",
      linked: false,
      linkedAt: null,
      shareWithTeam: false,
      source: "demo",
    }
  );
}
