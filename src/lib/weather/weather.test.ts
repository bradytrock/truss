import assert from "node:assert/strict";
import { alertKind, alertOnMap, alertPaint, alertRoute, areaCount, crewWarningText, issuedLine, leadCounty, minutesLeftLabel, parseHailInches, parseThreatSource, parseWindMph, shortAlertLabel, untilLabel } from "./alerts.ts";
import { countyUgcs, geometryFromZone, mergeGeometries } from "./counties.ts";
import { buildStormDesk, canvassScore, holdReasonFor } from "./desk.ts";
import { decimateRing, pointInGeometry } from "./geometry.ts";
import { geophysicalValue, hailLabel, meshInchesFromMillimeters } from "./hail.ts";
import { normalizeAlert } from "./feeds.ts";
import type { WeatherAlert } from "./types.ts";

const square = {
  type: "Polygon" as const,
  coordinates: [
    [
      [-97, 32],
      [-96, 32],
      [-96, 33],
      [-97, 33],
      [-97, 32],
    ],
    [
      [-96.6, 32.4],
      [-96.4, 32.4],
      [-96.4, 32.6],
      [-96.6, 32.6],
      [-96.6, 32.4],
    ],
  ],
};

assert.equal(pointInGeometry(-96.8, 32.5, square), true);
assert.equal(pointInGeometry(-96.5, 32.5, square), false);
assert.equal(pointInGeometry(-95, 32.5, square), false);
assert.equal(decimateRing([[0, 0], [1, 0], [2, 0], [3, 0], [0, 0]], 3).length <= 4, true);

assert.equal(geophysicalValue(20, -30, 0, 1), -1);
assert.equal(meshInchesFromMillimeters(-1), 0);
assert.equal(meshInchesFromMillimeters(25.4).toFixed(2), "1.00");
assert.match(hailLabel(1.5), /Ping pong/);
assert.equal(hailLabel(0.25), "");

assert.equal(alertRoute("Tornado Warning", null), "sms");
assert.equal(alertRoute("Severe Thunderstorm Watch", null), "leaders");
assert.equal(alertRoute("Wind Advisory", null), "map");
assert.equal(alertRoute("Special Weather Statement", 1), "sms");
assert.equal(parseHailInches({ maxHailSize: ["1.75"] }), 1.75);
assert.equal(parseWindMph({ maxWindGust: ["70 MPH"] }), 70);
assert.match(untilLabel("Severe Thunderstorm Warning until 6:55 PM CST by NWS", ""), /6:55 PM CST/);

assert.match(
  crewWarningText({
    event: "Severe Thunderstorm Warning",
    until: "6:55 PM CST",
    hailInches: 1.75,
    windMph: 70,
    places: ["Ortiz", "Alvarez"],
  }),
  /Get off the roof/,
);

const warning: WeatherAlert = {
  id: "warn-1",
  event: "Severe Thunderstorm Warning",
  severity: "Severe",
  headline: "Severe Thunderstorm Warning until 6:55 PM CST",
  instruction: "Get indoors.",
  onset: "",
  ends: "2026-11-02T00:55:00Z",
  until: "6:55 PM CST",
  hailInches: 1.75,
  windMph: 70,
  route: "sms",
  areaDesc: "Dallas",
  geometry: {
    type: "Polygon",
    coordinates: [[[-97, 32], [-96, 32], [-96, 33], [-97, 33], [-97, 32]]],
  },
};

const desk = buildStormDesk(
  [
    {
      id: "job-1",
      name: "Ortiz hail",
      code: "O-1",
      city: "Dallas",
      state: "TX",
      postalCode: "75201",
      status: "complete",
      lat: 32.5,
      lng: -96.8,
      ownerStaffId: "rep-1",
    },
    {
      id: "job-2",
      name: "Open roof",
      code: "O-2",
      city: "Dallas",
      state: "TX",
      postalCode: "75201",
      status: "in_progress",
      lat: 32.52,
      lng: -96.82,
      ownerStaffId: "rep-1",
    },
  ],
  {
    alerts: [warning],
    outlooks: [],
    reports: [
      {
        id: "lsr-1",
        kind: "hail",
        lat: 32.51,
        lng: -96.79,
        inches: 1,
        mph: null,
        label: "1.00 in hail · Dallas",
        city: "Dallas",
        valid: "2026-11-02T22:00:00Z",
      },
    ],
    mesh: [
      { id: "job-1", inches: 1.5 },
      { id: "job-2", inches: 1.25 },
    ],
    lightning: [{ id: "job-1", percent: 55 }],
  },
);

assert.equal(desk.warningCount, 2);
assert.equal(desk.canvass[0]?.id, "job-1");
assert.ok(canvassScore({ inches: 1.5, open: false, warned: true }) > canvassScore({ inches: 1.5, open: true, warned: true }));
assert.equal(canvassScore({ inches: 0.5, open: false, warned: false }), 0);
assert.match(desk.impacts[0]?.holdReason ?? "", /Severe Thunderstorm Warning/);
assert.equal(desk.impacts[0]?.photoPrompt, true);
assert.equal(desk.impacts[0]?.comps.length, 1);
assert.equal(desk.neighborhoods[0]?.jobs, 2);
assert.match(holdReasonFor({ warning: null, hailInches: 1.25, sigHail: false, outlookHail: 0.05 }), /radar-estimated/);

const parsed = normalizeAlert({
  properties: {
    id: "urn:test",
    event: "Tornado Warning",
    headline: "Tornado Warning until 7:40 PM CDT",
    parameters: { maxHailSize: ["2.00"], tornadoDetection: ["RADAR INDICATED"] },
    areaDesc: "Travis",
    senderName: "NWS Fort Worth TX",
    onset: "2026-11-02T19:41:00.000Z",
    ends: "2026-11-02T20:30:00.000Z",
    description: "At 141 PM CDT, a severe thunderstorm capable of producing a tornado was located near Argyle.",
  },
  geometry: null,
});
assert.equal(parsed?.route, "sms");
assert.equal(parsed?.hailInches, 2);
assert.equal(parsed?.kind, "warning");
assert.match(parsed?.until ?? "", /7:40 PM CDT/);
assert.equal(alertOnMap(parsed!), false);
assert.equal(parsed?.sender, "NWS Fort Worth TX");
assert.equal(parsed?.source, "Radar indicated");
assert.match(parsed?.description ?? "", /near Argyle/);
assert.equal(parseThreatSource({ hailThreat: ["OBSERVED"] }), "Observed");
assert.equal(parseThreatSource({}), "");
assert.equal(minutesLeftLabel("2026-11-02T20:30:00.000Z", new Date("2026-11-02T19:50:00.000Z")), "40 min left");
assert.equal(minutesLeftLabel("2026-11-02T20:30:00.000Z", new Date("2026-11-02T20:31:00.000Z")), "Expired");
assert.equal(minutesLeftLabel("", new Date()), "");
assert.equal(issuedLine(parsed!), "Issued 1:41 PM · expires 2:30 PM · NWS Fort Worth");
assert.equal(leadCounty("Denton, TX; Tarrant, TX"), "Denton County, TX");
assert.equal(leadCounty("Comanche, OK"), "Comanche County, OK");
assert.equal(leadCounty("Orleans Parish, LA"), "Orleans Parish, LA");
assert.equal(areaCount("Denton, TX; Tarrant, TX"), 2);

const watch = normalizeAlert({
  properties: {
    id: "watch-1",
    event: "Tornado Watch",
    headline: "Tornado Watch until 9:00 PM CST",
    areaDesc: "Tarrant; Denton",
    geocode: { UGC: ["TXC439", "TXZ101", "txc121"] },
    affectedZones: ["https://api.weather.gov/zones/county/TXC113"],
  },
  geometry: null,
});
assert.equal(watch?.kind, "watch");
assert.equal(watch?.route, "leaders");
assert.deepEqual(watch?.ugc, ["TXC439", "TXC121", "TXC113"]);
assert.equal(alertOnMap(watch!), true);
assert.equal(alertPaint(watch!).county, true);
assert.equal(alertPaint({ event: "Severe Thunderstorm Watch" }).fill, "#facc15");
assert.equal(alertPaint({ event: "Tornado Warning" }).county, false);
assert.equal(shortAlertLabel("Severe Thunderstorm Warning"), "SVR warning");
assert.equal(alertKind("Special Weather Statement"), "statement");
assert.deepEqual(countyUgcs({ geocode: { UGC: ["COC031"] }, affectedZones: ["https://api.weather.gov/zones/forecast/COZ001"] }), ["COC031"]);

const county = {
  type: "Polygon" as const,
  coordinates: [[[-97.5, 32.6], [-97.1, 32.6], [-97.1, 33], [-97.5, 33], [-97.5, 32.6]]],
};
const other = {
  type: "Polygon" as const,
  coordinates: [[[-97.1, 32.6], [-96.7, 32.6], [-96.7, 33], [-97.1, 33], [-97.1, 32.6]]],
};
const merged = mergeGeometries([county, other]);
assert.equal(merged?.type, "MultiPolygon");
assert.equal(geometryFromZone({ type: "Feature", geometry: county })?.type, "Polygon");
assert.equal(geometryFromZone({ type: "Feature", geometry: null }), null);

console.log("weather tests passed");
