import assert from "node:assert/strict";
import { pointInGeometry } from "./geometry.ts";
import { attachCountyGeometry, normalizeAlert } from "./feeds.ts";

const tarrant = {
  type: "Polygon" as const,
  coordinates: [
    [
      [-97.55, 32.55],
      [-97.05, 32.55],
      [-97.05, 32.99],
      [-97.55, 32.99],
      [-97.55, 32.55],
    ],
  ],
};
const denton = {
  type: "Polygon" as const,
  coordinates: [
    [
      [-97.4, 33.0],
      [-96.85, 33.0],
      [-96.85, 33.45],
      [-97.4, 33.45],
      [-97.4, 33.0],
    ],
  ],
};

const watch = normalizeAlert({
  properties: {
    id: "tornado-watch",
    event: "Tornado Watch",
    headline: "Tornado Watch until 9:00 PM CST",
    areaDesc: "Tarrant; Denton",
    geocode: { UGC: ["TXC439", "TXC121"] },
  },
  geometry: null,
});
const warning = normalizeAlert({
  properties: {
    id: "svr-warning",
    event: "Severe Thunderstorm Warning",
    headline: "Severe Thunderstorm Warning until 2:45 PM CST",
    geocode: { UGC: ["TXC439"] },
  },
  geometry: {
    type: "Polygon",
    coordinates: [[[-97.3, 32.7], [-97.1, 32.7], [-97.1, 32.85], [-97.3, 32.85], [-97.3, 32.7]]],
  },
});

assert.ok(watch);
assert.ok(warning);

const filled = await attachCountyGeometry([watch, warning], async (code) => {
  if (code === "TXC439") return tarrant;
  if (code === "TXC121") return denton;
  return null;
});

const shaded = filled[0];
const polygon = filled[1];
assert.equal(shaded?.geometry?.type, "MultiPolygon");
assert.equal(pointInGeometry(-97.3, 32.75, shaded?.geometry), true);
assert.equal(pointInGeometry(-97.1, 33.2, shaded?.geometry), true);
assert.equal(pointInGeometry(-96.5, 32.2, shaded?.geometry), false);
assert.equal(polygon?.geometry?.type, "Polygon");
assert.equal(pointInGeometry(-97.2, 32.8, polygon?.geometry), true);
assert.equal(pointInGeometry(-97.4, 32.6, polygon?.geometry), false);

console.log("county watch tests passed");
