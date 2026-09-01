import { initialsFromName, type SeatRole, type StaffMember } from "@/lib/types";

export function namesMatch(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function findStaffForProfile(
  roster: StaffMember[],
  profile: { staff_id?: string | null; full_name?: string | null },
) {
  if (profile.staff_id) {
    const byId = roster.find((member) => member.id === profile.staff_id);
    if (byId) return byId;
  }
  const name = profile.full_name?.trim();
  if (!name) return undefined;
  return roster.find((member) => namesMatch(member.name, name));
}

export function staffMemberFromProfile(input: {
  id: string;
  name: string;
  title: string;
  role: SeatRole;
  initials?: string;
}): StaffMember {
  return {
    id: input.id,
    name: input.name,
    title: input.title,
    role: input.role,
    teamId: null,
    initials: input.initials || initialsFromName(input.name),
    email: "",
    phone: "",
    locked: false,
    restricted: false,
    inviteExpiresAt: null,
    inviteToken: null,
    cardSlug: "",
    emailSignature: "",
  };
}

export function isUnsignedDemo(user: { id: string; companyId: string }) {
  return user.id === "local" || user.companyId === "local";
}
