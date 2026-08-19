import { startOfWeek } from "@/lib/format";
import type { StaffMember } from "@/lib/types";

export interface GoogleOverlayEvent {
  id: string;
  staffId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  htmlLink?: string;
  allDay?: boolean;
}

function at(weekStart: Date, dayOffset: number, hour: number, minute = 0, durationHours = 1) {
  const start = new Date(weekStart);
  start.setDate(weekStart.getDate() + dayOffset);
  start.setHours(hour, minute, 0, 0);
  const end = new Date(start);
  end.setHours(start.getHours() + durationHours, start.getMinutes(), 0, 0);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

/** Personal Google events for the Northline demo, pinned to the visible week. */
export function demoGoogleEvents(staff: StaffMember, rangeStart: Date, rangeEnd: Date): GoogleOverlayEvent[] {
  const week = startOfWeek(rangeStart);
  const recipes: Record<string, GoogleOverlayEvent[]> = {
    staff_elena: [
      { id: "gcal_elena_drop", staffId: "staff_elena", title: "School drop-off", location: "Park Hill", ...at(week, 0, 7, 30, 0.5) },
      { id: "gcal_elena_personal", staffId: "staff_elena", title: "Dentist", location: "Cherry Creek", ...at(week, 2, 7, 45, 1) },
      { id: "gcal_elena_supplier", staffId: "staff_elena", title: "Call · roofing supplier", location: "", ...at(week, 4, 16, 30, 0.5) },
    ],
    staff_maya: [
      { id: "gcal_maya_yoga", staffId: "staff_maya", title: "Yoga", location: "RiNo", ...at(week, 1, 6, 0, 1) },
      { id: "gcal_maya_hale", staffId: "staff_maya", title: "Lunch · Hale + Moss", location: "LoDo", ...at(week, 3, 11, 30, 1) },
    ],
    staff_priya: [
      { id: "gcal_priya_chamber", staffId: "staff_priya", title: "Denver Chamber breakfast", location: "Downtown", ...at(week, 3, 8, 0, 1) },
    ],
    staff_tom: [
      { id: "gcal_tom_abc", staffId: "staff_tom", title: "Material pickup · ABC Supply", location: "Commerce City", ...at(week, 4, 6, 30, 1) },
    ],
    staff_jordan: [
      { id: "gcal_jordan_review", staffId: "staff_jordan", title: "Weekly numbers", location: "Office", ...at(week, 0, 8, 0, 1) },
    ],
    staff_luis: [
      { id: "gcal_luis_crew", staffId: "staff_luis", title: "Crew stretch", location: "Yard", ...at(week, 0, 6, 15, 0.5) },
    ],
  };

  const items = recipes[staff.id] ?? [];
  return items.filter((event) => {
    const start = new Date(event.startsAt).getTime();
    return start >= rangeStart.getTime() && start <= rangeEnd.getTime();
  });
}
