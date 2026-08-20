import { NORTHLINE_STAFF, type CalendarAccount, type CalendarShare } from "@/lib/types";
import { demoGoogleEmail } from "@/lib/calendar";

function linked(
  staffId: string,
  shareWithTeam: boolean,
  linkedAt: string,
): CalendarAccount {
  const staff = NORTHLINE_STAFF.find((member) => member.id === staffId);
  return {
    staffId,
    googleEmail: demoGoogleEmail(staff?.name ?? "crew"),
    calendarId: "primary",
    linked: true,
    linkedAt,
    shareWithTeam,
    source: "demo",
  };
}

function unlinked(staffId: string): CalendarAccount {
  return {
    staffId,
    googleEmail: "",
    calendarId: "primary",
    linked: false,
    linkedAt: null,
    shareWithTeam: false,
    source: "demo",
  };
}

/** Northline sample: some seats already connected, with mixed sharing. */
export const seedCalendarAccounts: CalendarAccount[] = [
  unlinked("staff_jordan"),
  linked("staff_priya", false, "2026-06-04T15:10:00.000Z"),
  unlinked("staff_luis"),
  linked("staff_maya", true, "2026-05-18T14:00:00.000Z"),
  linked("staff_elena", true, "2026-04-22T16:40:00.000Z"),
  linked("staff_tom", false, "2026-07-09T13:20:00.000Z"),
  unlinked("staff_nora"),
];

export const seedCalendarShares: CalendarShare[] = [
  { ownerStaffId: "staff_maya", viewerStaffId: "staff_priya" },
];
