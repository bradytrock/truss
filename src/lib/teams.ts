import type { StaffMember, Team } from "@/lib/types";

export const NO_TEAM = "none";

export function teamById(teams: Team[], id: string | null | undefined) {
  if (!id) return undefined;
  return teams.find((team) => team.id === id);
}

export function teamName(teams: Team[], id: string | null | undefined) {
  return teamById(teams, id)?.name.trim() ?? "";
}

export function membersOnTeam(staff: StaffMember[], teamId: string) {
  return staff.filter((member) => member.teamId === teamId && !member.locked);
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
