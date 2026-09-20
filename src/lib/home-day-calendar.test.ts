import assert from "node:assert/strict";
import {
  eventBlockOnDay,
  eventsOnDay,
  homeDayGridHeight,
  homeDayHours,
  homeDayTitle,
} from "./home-day-calendar.ts";
import type { ScheduleEvent } from "./types.ts";

function event(partial: Partial<ScheduleEvent> & Pick<ScheduleEvent, "id" | "title" | "startsAt">): ScheduleEvent {
  return {
    kind: "meeting",
    endsAt: partial.endsAt ?? partial.startsAt,
    location: "",
    assignee: "Brady",
    opportunityId: null,
    jobId: null,
    clientId: null,
    notes: "",
    ...partial,
  };
}

const monday = event({
  id: "e1",
  title: "Site walk",
  startsAt: "2026-09-21T14:00:00",
  endsAt: "2026-09-21T15:30:00",
  kind: "site_walk",
});
const tuesday = event({
  id: "e2",
  title: "Punch",
  startsAt: "2026-09-22T09:00:00",
  endsAt: "2026-09-22T10:00:00",
});

assert.deepEqual(
  eventsOnDay([tuesday, monday], "2026-09-21").map((item) => item.id),
  ["e1"],
);
assert.equal(eventsOnDay([monday], "2026-09-22").length, 0);

const hours = homeDayHours();
assert.equal(hours[0], 6);
assert.equal(hours[hours.length - 1], 21);
assert.equal(homeDayGridHeight(), 15 * 36);

const block = eventBlockOnDay(monday);
assert.ok(block.top > 0);
assert.ok(block.height >= 22);

const titled = homeDayTitle(new Date(2026, 8, 20));
assert.match(titled, /September/);
assert.match(titled, /20/);

console.log("home-day-calendar.test.ts ok");
