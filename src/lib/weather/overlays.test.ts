import assert from "node:assert/strict";
import { arrivalLabel, clearsByLabel, hailClaimNote, hailEventsAtLeast, hailReports, jobBand, jobsWithin, nearestReportTo, reportClaimText, warningsAt } from "./overlays.ts";
import type { HailPopupHit } from "./hail-point.ts";
import type { StormCell, StormReport, WeatherAlert } from "./types.ts";

const now = new Date("2026-11-02T19:50:00.000Z");

const cell: StormCell = {
  id: "T3",
  radarSite: "KFWS",
  valid: "2026-11-02T19:45:00.000Z",
  lat: 33.1,
  lng: -97.2,
  maxDbz: 68,
  echoTopKft: 47,
  vil: 61,
  posh: 82,
  poh: 100,
  meshIn: 1.75,
  motionFromDeg: 270,
  motionKt: 21,
  tvs: false,
  meso: true,
  dbzTrend: 4,
};

const tornado: WeatherAlert = {
  id: "tor",
  event: "Tornado Warning",
  severity: "Extreme",
  headline: "Tornado Warning until 2:30 PM CDT",
  instruction: "",
  onset: "2026-11-02T18:41:00.000Z",
  ends: "2026-11-02T20:30:00.000Z",
  until: "2:30 PM CDT",
  hailInches: 1.25,
  windMph: null,
  route: "sms",
  areaDesc: "Denton, TX",
  geometry: { type: "Polygon", coordinates: [[[-97.3, 33], [-97.1, 33], [-97.1, 33.2], [-97.3, 33.2], [-97.3, 33]]] },
  kind: "warning",
};
const watch: WeatherAlert = { ...tornado, id: "watch", event: "Tornado Watch", kind: "watch", route: "leaders" };

const hit: HailPopupHit = {
  stormId: "oct27",
  stormDate: "2026-10-27",
  radarSite: "KFWS",
  stormMaxIn: 1.75,
  maxBandIn: 1.5,
  distanceMi: 0.6,
  passageAt: "2026-10-27T21:00:00.000Z",
  passedStart: "2026-10-27T20:55:00.000Z",
  passedEnd: "2026-10-27T21:05:00.000Z",
  report: { sizeIn: 1.75, place: "2 NW Flower Mound", reportedAt: "2026-10-27T21:31:00.000Z" },
  jobsInSwath: 3,
  source: "sample",
};

assert.deepEqual(warningsAt([watch, tornado], () => true).map((alert) => alert.id), ["tor"], "watches never reach a job card");

const quiet = { overhead: null, incoming: null, nearestMi: null };
const inTornado = jobBand({ warnings: [tornado], threat: quiet, swathHit: hit, now });
assert.equal(inTornado.kind, "tornado");
assert.equal(inTornado.tone, "red");
assert.equal(inTornado.label, "Tornado warning · until 2:30 PM CDT");

const severe = jobBand({ warnings: [{ ...tornado, event: "Severe Thunderstorm Warning", until: "2:40 PM CDT" }], threat: quiet, swathHit: null, now });
assert.equal(severe.kind, "warning");
assert.equal(severe.tone, "amber");
assert.equal(severe.label, "Severe T-storm warning · until 2:40 PM CDT");

const overhead = jobBand({ warnings: [], threat: { overhead: { cell, clearsInMinutes: 15 }, incoming: null, nearestMi: 1 }, swathHit: null, now });
assert.equal(overhead.kind, "overhead");
assert.equal(overhead.label, "Cell T3 overhead · 1.75″ hail");

const inbound = jobBand({ warnings: [], threat: { overhead: null, incoming: { cell, etaMinutes: 44 }, nearestMi: 12 }, swathHit: null, now });
assert.equal(inbound.kind, "incoming");
assert.equal(inbound.label, "Cell T3 inbound · ~39 min", "the countdown subtracts the minutes since the scan");

const swath = jobBand({ warnings: [], threat: quiet, swathHit: hit, now });
assert.equal(swath.kind, "swath");
assert.equal(swath.tone, "purple");
assert.equal(swath.label, "Inside Oct 27 hail swath");

const clear = jobBand({ warnings: [], threat: quiet, swathHit: null, now });
assert.equal(clear.label, "Clear · no storms within 25 mi");
assert.equal(jobBand({ warnings: [], threat: { ...quiet, nearestMi: 18.4 }, swathHit: null, now }).label, "Clear · nearest storm 18 mi");

assert.equal(arrivalLabel(cell.valid, 44, now), "~2:29 PM · 39 min");
assert.equal(clearsByLabel(cell.valid, 20, ""), "~2:05 PM");
assert.equal(clearsByLabel(cell.valid, null, tornado.ends), "~2:30 PM");
assert.equal(clearsByLabel(cell.valid, null, ""), "—");

assert.equal(hailEventsAtLeast([hit, { ...hit, maxBandIn: 0.75 }], 1), 1);

const reports: StormReport[] = [
  { id: "a", kind: "hail", lat: 33.05, lng: -97.0, inches: 1.75, mph: null, label: "1.75 in hail · Lewisville", city: "Lewisville", valid: "2026-10-27T21:31:00Z", remarks: "Golf ball hail on cars.", source: "Trained Spotter", state: "TX" },
  { id: "b", kind: "wind", lat: 33.0, lng: -97.0, inches: null, mph: 60, label: "60 mph", city: "", valid: "2026-10-27T21:00:00Z" },
  { id: "c", kind: "hail", lat: 34.5, lng: -97.0, inches: 1, mph: null, label: "1.00 in hail", city: "Ardmore", valid: "2026-10-27T20:00:00Z" },
];
const nearest = nearestReportTo(reports, 33.0, -97.05);
assert.equal(nearest?.report.id, "a");
assert.ok((nearest?.miles ?? 0) > 3 && (nearest?.miles ?? 0) < 5);
assert.deepEqual(hailReports(reports).map((report) => report.id), ["a", "c"]);
assert.equal(jobsWithin([{ lat: 33.0, lng: -97.0 }, { lat: 33.5, lng: -97.0 }], 33.0, -97.01, 1).length, 1);

const note = hailClaimNote(hit, "100 Falcon Court, Argyle, TX 76226");
assert.match(note, /^Radar-estimated hail 1\.50″ \(ping pong\) at 100 Falcon Court, Argyle, TX 76226 on Oct 27/);
assert.match(note, /Spotter: 1\.75″ hail 2 NW Flower Mound\./);

const text = reportClaimText(reports[0]!);
assert.match(text, /^NWS local storm report · 1\.75″ hail\n/);
assert.match(text, /Where: Lewisville, TX/);
assert.match(text, /Remarks: Golf ball hail on cars\./);
