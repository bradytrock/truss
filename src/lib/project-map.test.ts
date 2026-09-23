import assert from "node:assert/strict";
import {
  addressNeedsGeocode,
  CREW_LIVE_MS,
  CREW_STALE_MS,
  crewFreshness,
  jobHasCoords,
  jobMatchesProjectYear,
  jobSiteQuery,
  parseMapYear,
  parsePresenceBody,
  projectYear,
  projectYears,
  visibleCrew,
  crewMapLabel,
  jobMatchesMapSearch,
  clusterCellDegrees,
  clusterJobPins,
  geoShareErrorMessage,
  preferFresherPing,
  resolveSeatStaffId,
  shouldPostPresence,
  shouldStopSharingOnGeoError,
  GEO_PERMISSION_DENIED,
  GEO_TIMEOUT,
} from "./project-map-logic.ts";

assert.equal(projectYear({ startDate: "2026-03-15", code: "BJ010124-A" }), 2026);
assert.equal(projectYear({ startDate: "", code: "BJ091225-A" }), 2025);
assert.equal(projectYear({ startDate: "", code: "nope" }), null);
assert.deepEqual(projectYears([{ startDate: "2024-01-01", code: "" }, { startDate: "", code: "JH061226-A" }], new Date(2026, 8, 23)), [2026, 2024]);

assert.equal(jobMatchesProjectYear({ startDate: "2026-02-01", code: "" }, 2026), true);
assert.equal(jobMatchesProjectYear({ startDate: "2025-02-01", code: "" }, 2026), false);
assert.equal(jobMatchesProjectYear({ startDate: "2025-02-01", code: "" }, "all"), true);

assert.equal(jobSiteQuery({ street: "100 Main", city: "Dallas", state: "TX", postalCode: "75201", location: "" }), "100 Main, Dallas, TX 75201");
assert.equal(jobHasCoords({ lat: 32.7, lng: -96.8 }), true);
assert.equal(jobHasCoords({ lat: null, lng: -96.8 }), false);
assert.equal(
  addressNeedsGeocode({
    street: "100 Main",
    city: "Dallas",
    state: "TX",
    postalCode: "75201",
    location: "",
    lat: 32.7,
    lng: -96.8,
    geocodeQuery: "100 Main, Dallas, TX 75201",
  }),
  false,
);
assert.equal(
  addressNeedsGeocode({
    street: "200 Main",
    city: "Dallas",
    state: "TX",
    postalCode: "75201",
    location: "",
    lat: 32.7,
    lng: -96.8,
    geocodeQuery: "100 Main, Dallas, TX 75201",
  }),
  true,
);
assert.equal(
  addressNeedsGeocode({
    street: "",
    city: "",
    state: "",
    postalCode: "",
    location: "",
    lat: null,
    lng: null,
    geocodeQuery: "",
  }),
  false,
);

const now = Date.parse("2026-09-23T12:00:00.000Z");
assert.equal(crewFreshness(new Date(now - 2 * 60 * 1000).toISOString(), now), "live");
assert.equal(crewFreshness(new Date(now - CREW_LIVE_MS - 1000).toISOString(), now), "stale");
assert.equal(crewFreshness(new Date(now - CREW_STALE_MS - 1000).toISOString(), now), "gone");
assert.equal(
  visibleCrew(
    [
      { staffId: "a", name: "A", lat: 1, lng: 1, accuracy: null, heading: null, updatedAt: new Date(now).toISOString() },
      { staffId: "b", name: "B", lat: 1, lng: 1, accuracy: null, heading: null, updatedAt: new Date(now - CREW_STALE_MS - 1).toISOString() },
    ],
    now,
  ).map((row) => row.staffId).join(),
  "a",
);

assert.equal(parseMapYear("2024", [2026, 2024]), 2024);
assert.equal(parseMapYear("all", [2026, 2024]), "all");
assert.equal(parseMapYear("1999", [2026, 2024]), 2026);

const ok = parsePresenceBody({ lat: 32.8, lng: -96.8, accuracy: 12 });
assert.ok(!("error" in ok));
assert.equal(ok.lat, 32.8);
assert.equal(ok.accuracy, 12);
assert.equal(parsePresenceBody({ lat: 200, lng: -96.8 }).error, "Need a valid latitude and longitude.");
assert.equal(parsePresenceBody({ lat: "nope", lng: -96.8 }).error, "Need a valid latitude and longitude.");

assert.equal(crewMapLabel("Kyle Marty"), "Kyle Marty");
assert.equal(crewMapLabel("Kyle James Marty"), "Kyle Marty");
assert.equal(jobMatchesMapSearch({ name: "Jones", street: "907 Shadow Ridge", city: "Highland Village" }, "shadow"), true);
assert.equal(jobMatchesMapSearch({ name: "Jones", street: "907 Shadow Ridge" }, "dallas", ["Lisa Roach"]), false);
assert.equal(jobMatchesMapSearch({ name: "Jones" }, "lisa", ["Lisa Roach"]), true);
assert.equal(clusterCellDegrees(16), 0);
assert.equal(clusterJobPins([{ id: "a", lat: 32.96, lng: -97.05 }, { id: "b", lat: 33.2, lng: -96.7 }], 16).length, 2);
assert.equal(clusterJobPins([{ id: "a", lat: 32.9, lng: -97.0 }, { id: "b", lat: 32.91, lng: -97.01 }], 8)[0]?.jobIds.length, 2);

assert.equal(geoShareErrorMessage({ insecure: true }).includes("https"), true);
assert.equal(geoShareErrorMessage({ code: GEO_PERMISSION_DENIED }).includes("blocked"), true);
assert.equal(shouldStopSharingOnGeoError(GEO_PERMISSION_DENIED), true);
assert.equal(shouldStopSharingOnGeoError(GEO_TIMEOUT), false);
assert.equal(shouldStopSharingOnGeoError(undefined), false);
assert.equal(shouldPostPresence(null, 1000), true);
assert.equal(shouldPostPresence(0, 9_000), false);
assert.equal(shouldPostPresence(0, 10_000), true);

const livePing = {
  staffId: "me",
  name: "Pat",
  lat: 32.8,
  lng: -96.8,
  accuracy: 20,
  heading: null,
  updatedAt: "2026-09-23T12:00:10.000Z",
};
assert.deepEqual(
  preferFresherPing(
    [{ ...livePing, updatedAt: "2026-09-23T12:00:00.000Z", lat: 32.7 }],
    livePing,
  ),
  [livePing],
);
assert.equal(resolveSeatStaffId({ profileStaffId: "seat-1" }), "seat-1");
assert.equal(
  resolveSeatStaffId({
    email: "pat@example.com",
    roster: [{ id: "seat-2", email: "pat@example.com", name: "Pat" }],
  }),
  "seat-2",
);

console.log("project-map tests passed");
