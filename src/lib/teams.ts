import type { StaffMember, Team } from "@/lib/types";

export const NO_TEAM = "none";

type TeamSeat = {
  teamId?: string | null;
  teamIds?: readonly (string | null | undefined)[] | null;
};

export function teamById(teams: Team[], id: string | null | undefined) {
  if (!id) return undefined;
  return teams.find((team) => team.id === id);
}

export function teamName(teams: Team[], id: string | null | undefined) {
  return teamById(teams, id)?.name.trim() ?? "";
}

export function normalizeTeamIds(ids: readonly (string | null | undefined)[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids ?? []) {
    const id = raw?.trim() ?? "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Every team on the seat. An explicit teamIds list wins; otherwise the primary team is used. */
export function memberTeamIds(member: TeamSeat): string[] {
  if (Array.isArray(member.teamIds)) {
    const listed = normalizeTeamIds(member.teamIds);
    const primary = member.teamId?.trim() ?? "";
    if (primary && listed.includes(primary)) {
      return [primary, ...listed.filter((id) => id !== primary)];
    }
    return listed;
  }
  const primary = member.teamId?.trim() ?? "";
  return primary ? [primary] : [];
}

/** Keep the current primary when it is still selected. Otherwise the first id. */
export function primaryTeamId(teamIds: readonly (string | null | undefined)[], previous?: string | null): string {
  const ids = normalizeTeamIds(teamIds);
  const prior = previous?.trim() ?? "";
  if (prior && ids.includes(prior)) return prior;
  return ids[0] ?? "";
}

export function staffWithTeams<T extends TeamSeat>(
  member: T,
  teamIds: readonly (string | null | undefined)[],
  previousPrimary?: string | null,
): T {
  const ids = normalizeTeamIds(teamIds);
  const primary = primaryTeamId(ids, previousPrimary ?? member.teamId);
  const ordered = primary ? [primary, ...ids.filter((id) => id !== primary)] : [];
  return { ...member, teamId: primary || null, teamIds: ordered };
}

export function addTeamMembership<T extends TeamSeat>(member: T, teamId: string): T {
  const id = teamId.trim();
  const ids = memberTeamIds(member);
  if (!id || ids.includes(id)) return staffWithTeams(member, ids, member.teamId);
  return staffWithTeams(member, [...ids, id], member.teamId || id);
}

export function sameTeamIds(left: TeamSeat, right: TeamSeat) {
  const a = memberTeamIds(left);
  const b = new Set(memberTeamIds(right));
  return a.length === b.size && a.every((id) => b.has(id));
}

export function sharesAnyTeam(left: TeamSeat, right: TeamSeat) {
  const ids = new Set(memberTeamIds(left));
  if (ids.size === 0) return false;
  return memberTeamIds(right).some((id) => ids.has(id));
}

export function membersOnTeam(staff: StaffMember[], teamId: string) {
  return staff.filter((member) => memberTeamIds(member).includes(teamId) && !member.locked);
}

/** Primary team first, then the rest by name. */
export function staffTeamNames(teams: Team[], member: TeamSeat) {
  const [primary, ...rest] = memberTeamIds(member);
  const primaryName = primary ? teamName(teams, primary) : "";
  const extras = rest
    .map((id) => teamName(teams, id))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  return [primaryName, ...extras].filter(Boolean);
}

export function attachTeamMemberships<T extends TeamSeat & { id: string }>(
  staff: T[],
  memberships: readonly { staff_id: string; team_id: string | null }[],
): T[] {
  const byStaff = new Map<string, string[]>();
  for (const row of memberships) {
    const teamId = row.team_id?.trim() ?? "";
    if (!teamId) continue;
    const list = byStaff.get(row.staff_id) ?? [];
    if (!list.includes(teamId)) list.push(teamId);
    byStaff.set(row.staff_id, list);
  }
  return staff.map((member) => {
    const listed = byStaff.get(member.id);
    if (!listed) return staffWithTeams(member, memberTeamIds(member), member.teamId);
    const primary = member.teamId?.trim() ?? "";
    const ids = primary && !listed.includes(primary) ? [primary, ...listed] : listed;
    return staffWithTeams(member, ids, member.teamId);
  });
}

export function parseTeamSelect(value: string | null | undefined) {
  if (!value || value === NO_TEAM) return "";
  return value;
}

export function selectValueForTeam(teamId: string | null | undefined) {
  return teamId?.trim() ? teamId : NO_TEAM;
}

export function teamsAfterLeavingLead(teams: Team[], staffId: string, keepTeamId?: string | null): Team[] {
  return teams.map((team) =>
    team.leadStaffId === staffId && team.id !== keepTeamId ? { ...team, leadStaffId: "" } : team,
  );
}

/** Drop leadership only for teams this person no longer belongs to. */
export function teamsLedAfterMembershipChange(teams: Team[], staffId: string, stillOn: readonly string[]): Team[] {
  const keep = new Set(stillOn);
  return teams.map((team) =>
    team.leadStaffId === staffId && !keep.has(team.id) ? { ...team, leadStaffId: "" } : team,
  );
}
