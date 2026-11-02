import assert from "node:assert/strict";
import type { CropGrid } from "./grib.ts";
import { pointInGeometry } from "./geometry.ts";
import { meshSwathFromGrid } from "./mesh-swath.ts";

function grid(values: number[][], lat0 = 33, lon0 = -97): CropGrid {
  const height = values.length;
  const width = values[0]?.length ?? 0;
  const flat = new Float32Array(width * height);
  flat.fill(Number.NaN);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const value = values[row]?.[col];
      if (value != null && value > 0) flat[row * width + col] = value;
    }
  }
  return {
    valid: "2026-11-02T18:00:00.000Z",
    originRow: 0,
    originCol: 0,
    width,
    height,
    lat0,
    lon0,
    dlat: 0.1,
    dlon: 0.1,
    values: flat,
  };
}

const block = meshSwathFromGrid(
  grid([
    [0, 0, 0, 0],
    [0, 1.6, 1.2, 0],
    [0, 0.9, 0.4, 0],
    [0, 0, 0, 0],
  ]),
);
assert.ok(block);
assert.equal(block.source, "mesh");
assert.equal(block.stormMaxIn, 1.6);
assert.equal(block.stormDate, "2026-11-02");
assert.ok(block.bands.some((band) => band.sizeIn === 0.75));
assert.ok(block.bands.some((band) => band.sizeIn === 1.5));
assert.equal(block.bands.some((band) => band.sizeIn === 1.75), false);
const penny = block.bands.find((band) => band.sizeIn === 0.75);
const ball = block.bands.find((band) => band.sizeIn === 1.5);
assert.equal(pointInGeometry(-96.9, 32.9, penny?.geometry), true);
assert.equal(pointInGeometry(-96.8, 32.9, penny?.geometry), true);
assert.equal(pointInGeometry(-96.7, 32.8, penny?.geometry), false);
assert.equal(pointInGeometry(-96.9, 32.9, ball?.geometry), true);
assert.equal(pointInGeometry(-96.8, 32.9, ball?.geometry), false);

const empty = meshSwathFromGrid(grid([[0.2, 0.4], [0.1, 0]]));
assert.equal(empty, null);

const holeValues = [
  [1, 1, 1],
  [1, 0, 1],
  [1, 1, 1],
];
const holed = meshSwathFromGrid(grid(holeValues, 10, -100));
assert.ok(holed);
const outer = holed.bands.find((band) => band.sizeIn === 0.75);
assert.equal(pointInGeometry(-99.9, 9.9, outer?.geometry), false, "the empty center is not hail");
assert.equal(pointInGeometry(-100, 9.9, outer?.geometry), true, "the ring around the hole is hail");

console.log("mesh swath tests passed");
