import assert from "node:assert/strict";
import { drawingFromRoofTrace, imagePixelSize, satelliteFeetPerPixel } from "./roof-measure-satellite.ts";

const equator = satelliteFeetPerPixel(0, 0, 1);
const published = ((2 * Math.PI * 6378137) / 256) * 3.280839895013123;
assert.ok(Math.abs(equator - published) < 1, `equator feet/pixel ${equator}`);
assert.ok(Math.abs(satelliteFeetPerPixel(0, 0, 2) * 2 - equator) < 0.01);
assert.ok(satelliteFeetPerPixel(39.74, 20, 2) > 0.05);
assert.ok(satelliteFeetPerPixel(39.74, 20, 2) < 1);

const png = new Uint8Array(24);
png[0] = 0x89;
png[1] = 0x50;
png[16] = 0;
png[17] = 0;
png[18] = 0x05;
png[19] = 0x00;
png[20] = 0;
png[21] = 0;
png[22] = 0x02;
png[23] = 0x80;
assert.deepEqual(imagePixelSize(png), { width: 1280, height: 640 });

const drawing = drawingFromRoofTrace({
  imageWidth: 1000,
  imageHeight: 1000,
  feetPerPixel: 0.2,
  trace: {
    facets: [
      {
        pitchRise: 6,
        points: [
          { x: 0.1, y: 0.1, toNext: "eave" },
          { x: 0.5, y: 0.1, toNext: "hip" },
          { x: 0.5, y: 0.5, toNext: "eave" },
          { x: 0.1, y: 0.5, toNext: "rake" },
        ],
      },
      {
        pitchRise: 8,
        points: [
          { x: 0.502, y: 0.1, toNext: "eave" },
          { x: 0.9, y: 0.1, toNext: "rake" },
          { x: 0.9, y: 0.5, toNext: "eave" },
          { x: 0.5, y: 0.498, toNext: "eave" },
        ],
      },
    ],
  },
});

assert.equal(drawing.facets.length, 2);
assert.equal(drawing.feetPerPixel, 0.2);
const hips = drawing.edges.filter((edge) => edge.kind === "hip");
assert.equal(hips.length, 1, "shared edge snapped and labeled hip");
assert.ok(drawing.points.length < 8, "nearby corners share a vertex");
assert.ok(drawing.wastePercent >= 10);

const empty = drawingFromRoofTrace({
  trace: { facets: [] },
  imageWidth: 1280,
  imageHeight: 1280,
  feetPerPixel: 0.2,
});
assert.equal(empty.facets.length, 0);
assert.equal(empty.feetPerPixel, 0.2);

console.log("roof-measure-satellite tests passed");
