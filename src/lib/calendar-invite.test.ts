import assert from "node:assert/strict";
import {
  externalInvitees,
  googleCalendarInviteBody,
  guestInviteHint,
  inviteSentCopy,
  isInsideOrganization,
  parseGuestEmails,
  partitionGuestEmails,
} from "./calendar-invite.ts";

const northline = {
  staffEmails: ["Alex@Northlineco.com", "priya@gmail.com"],
};

assert.deepEqual(parseGuestEmails("  Dana@Gmail.com, dana@gmail.com; not-an-email\ncrew@northlineco.com "), [
  "dana@gmail.com",
  "crew@northlineco.com",
]);

assert.equal(isInsideOrganization("alex@northlineco.com", northline), true);
assert.equal(isInsideOrganization("crew@northlineco.com", northline), false);
assert.equal(isInsideOrganization("priya@gmail.com", northline), true);
assert.equal(isInsideOrganization("dana@gmail.com", northline), false);
assert.equal(isInsideOrganization("other@gmail.com", northline), false);

const split = partitionGuestEmails(
  ["dana@gmail.com", "alex@northlineco.com", "adjuster@statefarm.com"],
  northline,
);
assert.deepEqual(split.outside, ["dana@gmail.com", "adjuster@statefarm.com"]);
assert.deepEqual(split.inside, ["alex@northlineco.com"]);
assert.deepEqual(externalInvitees("alex@northlineco.com", northline), []);

const many = Array.from({ length: 52 }, (_, index) => `person${index}@example.com`);
const capped = partitionGuestEmails(many, { staffEmails: [] });
assert.equal(capped.outside.length, 50);
assert.equal(capped.truncated, 2);

assert.match(guestInviteHint([], []), /outside the company/);
assert.match(guestInviteHint(["dana@gmail.com"], ["alex@northlineco.com"]), /dana@gmail.com/);
assert.match(inviteSentCopy(["dana@gmail.com"]), /dana@gmail.com/);

const body = googleCalendarInviteBody({
  title: "Site walk",
  startsAt: "2026-09-29T15:00:00.000Z",
  endsAt: "2026-09-29T16:00:00.000Z",
  location: "2841 Forest St",
  notes: "South slope",
  attendeeEmails: ["dana@gmail.com"],
});
assert.equal(body.summary, "Site walk");
assert.deepEqual(body.attendees, [{ email: "dana@gmail.com" }]);
assert.equal(body.start.dateTime, "2026-09-29T15:00:00.000Z");

console.log("calendar-invite.test.ts ok");
