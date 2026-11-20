import assert from "node:assert/strict";
import {
  cellApproach,
  cellGrowthNote,
  cellKind,
  cellThreatText,
  compassPoint,
  formatMotion,
  jobsInPath,
  nearestCell,
  parseStormAttributes,
  pointThreat,
  projectCell,
  roofDamageLabel,
  significantCells,
  townArrivals,
} from "./cells.ts";
import type { StormCell } from "./types.ts";

const CSV = `VALID,STORM_ID,NEXRAD,AZIMUTH,RANGE,TVS,MESO,POSH,POH,MAX_SIZE,VIL,MAX_DBZ,MAZ_DBZ_H,TOP,DRCT,SKNT,LAT,LON
202611021833,T3,FWS,349,287,NONE,NONE,0,0,0.0,23,50,25.5,32.0,0,0,33.00,-97.30
202611021840,T3,FWS,351,292,NONE,MESO,82,100,1.75,61,68,26.3,47.0,270,21,33.02,-97.25
202611021840,Q7,FWS,10,40,NONE,NONE,41,80,1.00,34,54,20.1,38.0,270,18,32.80,-97.20
202611021812,K2,FWS,10,40,NONE,NONE,8,20,0.5,18,47,20.1,29.0,250,6,32.60,-96.90
202611021840,A0,FWS,10,40,NONE,NONE,0,0,0.0,5,31,20.1,20.0,250,6,32.50,-96.70
`;

const now = new Date("2026-11-02T18:45:00.000Z");
const cells = parseStormAttributes(CSV, now);
assert.deepEqual(
  cells.map((cell) => cell.id),
  ["T3", "Q7", "A0"],
  "the newest scan of each cell is kept, stale K2 is dropped, strongest first",
);
const t3 = cells.find((cell) => cell.id === "T3");
assert.ok(t3);
assert.equal(t3.valid, "2026-11-02T18:40:00.000Z");
assert.equal(t3.radarSite, "KFWS");
assert.equal(t3.meso, true);
assert.equal(t3.tvs, false);
assert.equal(t3.dbzTrend, 18, "trend compares against the earlier scan of the same cell");
assert.equal(t3.meshIn, 1.75);
assert.equal(cellKind(t3), "supercell");
const q7 = cells.find((cell) => cell.id === "Q7");
assert.ok(q7);
assert.equal(cellKind(q7), "multicell");
assert.equal(significantCells(cells).map((cell) => cell.id).join(","), "T3,Q7");
assert.equal(parseStormAttributes("ERROR: no results found for your query").length, 0);

assert.equal(compassPoint(70), "E");
assert.equal(compassPoint(350), "N");
assert.equal(formatMotion(t3), "E 24 mph", "motion from 270° is reported toward east, in mph");
assert.equal(formatMotion({ ...t3, motionFromDeg: 225 }), "NE 24 mph");
const parked: StormCell = { ...t3, motionKt: 2 };
assert.equal(formatMotion(parked), "Stationary");

const ahead = projectCell(t3, 30);
assert.ok(ahead.lng > t3.lng, "a cell moving from 270° heads east");
assert.ok(Math.abs(ahead.lat - t3.lat) < 0.1);

// 12 miles east, along the track: about 30 minutes away at 24 mph.
const incoming = cellApproach(t3, 33.02, -97.25 + 12 / (69.172 * Math.cos((33.02 * Math.PI) / 180)));
assert.equal(incoming.status, "incoming");
if (incoming.status === "incoming") assert.ok(incoming.etaMinutes >= 27 && incoming.etaMinutes <= 33, `eta ${incoming.etaMinutes}`);
const behind = cellApproach(t3, 33.02, -97.45);
assert.equal(behind.status, "passed");
const beside = cellApproach(t3, 33.25, -97.1);
assert.equal(beside.status, "clear");
const under = cellApproach(t3, 33.03, -97.24);
assert.equal(under.status, "overhead");
if (under.status === "overhead") assert.ok((under.clearsInMinutes ?? 0) >= 5 && (under.clearsInMinutes ?? 0) <= 12, `clears ${under.clearsInMinutes}`);

const jobs = [
  { id: "a", city: "Argyle", lat: 33.03, lng: -97.24 },
  { id: "b", city: "The Colony", lat: 33.02, lng: -97.05 },
  { id: "c", city: "Waco", lat: 31.55, lng: -97.15 },
];
const path = jobsInPath(t3, jobs);
assert.deepEqual(
  path.map((hit) => hit.job.id),
  ["a", "b"],
);
assert.equal(path[0]?.overhead, true);
assert.ok((path[1]?.etaMinutes ?? 0) > 10);
const towns = townArrivals(t3, jobs);
assert.deepEqual(towns.map((row) => row.city), ["Argyle", "The Colony"]);

assert.equal(nearestCell(cells, 32.8, -97.21)?.cell.id, "Q7");
const threat = pointThreat(cells, 33.03, -97.24);
assert.equal(threat.overhead?.cell.id, "T3");
assert.equal(threat.incoming, null);
const nextUp = pointThreat(cells, 32.8, -97.0);
assert.equal(nextUp.overhead, null);
assert.equal(nextUp.incoming?.cell.id, "Q7");

assert.match(cellThreatText(t3), /1\.75″ hail · 70 mph · rotation/);
assert.equal(cellGrowthNote({ id: "T3", maxDbz: 50, meshIn: 1, posh: 40 }, t3), "Cell T3 grew: hail is now 1.75″.");
assert.equal(cellGrowthNote({ id: "T3", maxDbz: 68, meshIn: 1.75, posh: 82 }, t3), null);
assert.equal(roofDamageLabel(1.75), "roof damage likely");
assert.equal(roofDamageLabel(0.75), "cosmetic at most");
