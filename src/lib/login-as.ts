import type { StaffMember, Team } from "@/lib/types";

export const LOGIN_AS_RECENT_LIMIT = 5;

function storageKey(viewerId: string) {
  return `truss.loginAs.recent.${viewerId}`;
}

export function readLoginAsRecent(viewerId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(viewerId)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.trim() !== "");
  } catch {
    return [];
  }
}

export function rememberLoginAsRecent(viewerId: string, staffId: string) {
  if (typeof window === "undefined") return;
  const next = [staffId, ...readLoginAsRecent(viewerId).filter((id) => id !== staffId)].slice(
    0,
    LOGIN_AS_RECENT_LIMIT,
  );
  try {
    window.localStorage.setItem(storageKey(viewerId), JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
}

export function recentLoginAsTargets(options: StaffMember[], recentIds: string[]) {
  const byId = new Map(options.map((member) => [member.id, member]));
  const seen = new Set<string>();
  return recentIds.flatMap((id) => {
    if (seen.has(id)) return [];
    const member = byId.get(id);
    if (!member) return [];
    seen.add(id);
    return [member];
  });
}

export function groupLoginAsTargets(staff: StaffMember[], teams: Team[]) {
  const nameFor = (teamId: string | null) =>
    teams.find((team) => team.id === teamId)?.name.trim() || "No team";
  const groups = new Map<string, StaffMember[]>();
  const sorted = [...staff].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  for (const member of sorted) {
    const heading = nameFor(member.teamId);
    const list = groups.get(heading) ?? [];
    list.push(member);
    groups.set(heading, list);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === "No team") return 1;
    if (b === "No team") return -1;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
}
