import assert from "node:assert/strict";
import {
  attachAccountInvites,
  inviteCanRefresh,
  inviteIsExpired,
  inviteIsPending,
  inviteLinkUsable,
  inviteSendBlockReason,
  seatInviteStatus,
  staffStatusLabel,
} from "./accounts.ts";
import type { StaffMember } from "./types.ts";

const now = Date.parse("2026-10-22T12:00:00.000Z");
const past = "2026-10-01T00:00:00.000Z";
const future = "2026-11-05T00:00:00.000Z";

function seat(patch: Partial<StaffMember> = {}): StaffMember {
  return {
    id: "staff_ada",
    name: "Ada Lopez",
    title: "Project manager",
    role: "project_manager",
    teamId: null,
    initials: "AL",
    email: "ada@example.com",
    phone: "",
    cardSlug: "ada.lopez",
    emailSignature: "",
    locked: false,
    restricted: false,
    inviteExpiresAt: null,
    inviteToken: null,
    ...patch,
  };
}

const usedExpired = seat({
  inviteToken: "used-token",
  inviteExpiresAt: past,
  inviteUsedAt: "2026-09-20T00:00:00.000Z",
});

assert.equal(seatInviteStatus(usedExpired, now), "used");
assert.equal(staffStatusLabel(usedExpired, now), "Active");
assert.equal(inviteIsExpired(usedExpired, now), false);
assert.equal(inviteIsPending(usedExpired, now), false);
assert.equal(inviteLinkUsable(usedExpired, now), false);

const signedInExpired = seat({
  inviteToken: "stale-token",
  inviteExpiresAt: past,
  signedIn: true,
});
assert.equal(staffStatusLabel(signedInExpired, now), "Active");
assert.equal(inviteIsExpired(signedInExpired, now), false);
assert.equal(seatInviteStatus(signedInExpired, now), "used");

const openInvite = seat({ inviteToken: "open-token", inviteExpiresAt: future });
assert.equal(staffStatusLabel(openInvite, now), "Invite pending");
assert.equal(inviteIsPending(openInvite, now), true);
assert.equal(inviteLinkUsable(openInvite, now), true);
assert.equal(inviteCanRefresh(openInvite, now), true);

const expiredInvite = seat({ inviteToken: "old-token", inviteExpiresAt: past });
assert.equal(staffStatusLabel(expiredInvite, now), "Invite expired");
assert.equal(inviteIsExpired(expiredInvite, now), true);
assert.equal(inviteIsPending(expiredInvite, now), false);
assert.equal(inviteCanRefresh(expiredInvite, now), true);
assert.equal(inviteLinkUsable(expiredInvite, now), false);

const accepted = seat({
  inviteToken: "accepted-token",
  inviteExpiresAt: future,
  inviteAcceptedAt: "2026-10-20T00:00:00.000Z",
});
assert.equal(staffStatusLabel(accepted, now), "Invite accepted");
assert.equal(inviteIsPending(accepted, now), true);

const acceptedThenExpired = seat({
  inviteToken: "accepted-token",
  inviteExpiresAt: past,
  inviteAcceptedAt: "2026-09-01T00:00:00.000Z",
});
assert.equal(staffStatusLabel(acceptedThenExpired, now), "Invite expired");

const declined = seat({
  inviteToken: "declined-token",
  inviteExpiresAt: past,
  inviteDeclinedAt: "2026-09-15T00:00:00.000Z",
});
assert.equal(staffStatusLabel(declined, now), "Invite declined");
assert.equal(inviteIsExpired(declined, now), false);
assert.equal(inviteIsPending(declined, now), false);
assert.equal(seatInviteStatus(declined, now), "declined");

assert.equal(staffStatusLabel(seat(), now), "Active");
assert.equal(staffStatusLabel(seat({ locked: true, inviteExpiresAt: past, inviteToken: "x" }), now), "Locked");
assert.equal(
  staffStatusLabel(seat({ restricted: true, signedIn: true, inviteExpiresAt: past, inviteToken: "x" }), now),
  "Restricted",
);

const [joined] = attachAccountInvites(
  [seat({ inviteExpiresAt: past })],
  [
    {
      staff_id: "staff_ada",
      token: "used-token",
      expires_at: past,
      used_at: "2026-09-20T00:00:00.000Z",
    },
  ],
);
assert.equal(joined?.inviteUsedAt, "2026-09-20T00:00:00.000Z");
assert.equal(staffStatusLabel(joined!, now), "Active");
assert.equal(joined?.inviteToken, "used-token");

const [loggedIn] = attachAccountInvites(
  [seat()],
  [{ staff_id: "staff_ada", token: "stale-token", expires_at: past, used_at: null }],
  ["staff_ada"],
);
assert.equal(loggedIn?.signedIn, true);
assert.equal(staffStatusLabel(loggedIn!, now), "Active");

const [waiting] = attachAccountInvites(
  [seat()],
  [{ staff_id: "staff_ada", token: "open-token", expires_at: future }],
);
assert.equal(staffStatusLabel(waiting!, now), "Invite pending");

const [turnedDown] = attachAccountInvites(
  [seat()],
  [
    {
      staff_id: "staff_ada",
      token: "nope",
      expires_at: future,
      declined_at: "2026-10-02T00:00:00.000Z",
    },
  ],
);
assert.equal(staffStatusLabel(turnedDown!, now), "Invite declined");

assert.equal(
  inviteSendBlockReason({ token: "used-token", expires_at: future, used_at: past }, now),
  "That invite was already used. Refresh it, then send again.",
);
assert.equal(
  inviteSendBlockReason({ token: "old-token", expires_at: past }, now),
  "That invite expired. Refresh it, then send again.",
);
assert.equal(inviteSendBlockReason({ token: "open-token", expires_at: future }, now), null);
assert.equal(
  inviteSendBlockReason({ token: "nope", expires_at: future, declined_at: past }, now),
  "That invite was declined. Refresh it, then send again.",
);

console.log("accounts.test.ts ok");
