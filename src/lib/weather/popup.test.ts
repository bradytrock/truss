import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import {
  chicagoDaysAgo,
  dbzFromRgba,
  formatChicagoClock,
  formatHailInches,
  hailAtPoint,
  hailChanceLabel,
  headerHit,
  hiddenStormNote,
  hoverReadout,
  jobsInsideStorm,
  popupPanDelta,
  radarActive,
  radarCategory,
  splitVisibleStorms,
} from "./hail-point.ts";
import { readPngPixel } from "./radar-png.ts";
import { SAMPLE_HAIL_POINT, sampleHailStorms } from "./sample-storms.ts";

const now = new Date("2026-11-02T18:00:00.000Z");
const storms = sampleHailStorms();
const point = SAMPLE_HAIL_POINT;

const hits = hailAtPoint(storms, point.lat, point.lng, { now });
assert.equal(hits.length, 1, "the Flower Mound sample point sits in one swath");
const hit = hits[0];
assert.ok(hit);
assert.equal(hit.maxBandIn, 1.5);
assert.equal(hit.storm.stormMaxIn, 1.75);
assert.ok(hit.distanceMi > 0.4 && hit.distanceMi < 0.9, `distance ${hit.distanceMi}`);
assert.equal(chicagoDaysAgo(hit.storm.stormDate, now), 6);
assert.match(formatChicagoClock(hit.passageAt), /PM CDT/);
assert.equal(formatHailInches(1.5), "1.50\u2033");
assert.equal(formatHailInches(0.75), ".75\u2033");
assert.equal(headerHit(hits)?.storm.id, hit.storm.id);

const outside = hailAtPoint(storms, 36.905, -100.584, { now });
assert.equal(outside.length, 0);
assert.equal(hoverReadout(outside), "No hail here");
assert.match(hoverReadout(hits), /1\.50″ Ping pong · Oct 27/);

const hidden = splitVisibleStorms(hits, new Set([hit.storm.id]));
assert.equal(hidden.visible.length, 0);
assert.match(hiddenStormNote(hidden.hidden), /Oct 27 \(Golf ball\) is hidden/);

const two = hailAtPoint(storms, 32.52, -97.2, { now });
assert.ok(two.length >= 1);
if (two.length > 1) assert.match(hoverReadout(two), /\+\d+ more/);

const jobs = [
  { lat: point.lat, lng: point.lng },
  { lat: 36.9, lng: -100.5 },
];
assert.equal(jobsInsideStorm(hit.storm, jobs), 1);

assert.equal(radarCategory(30), "Moderate rain");
assert.equal(radarCategory(45), "Heavy rain");
assert.equal(radarCategory(55), "Heavy · hail possible");
assert.equal(hailChanceLabel(55), "Possible");
assert.equal(dbzFromRgba(255, 0, 0, 255), 55);
assert.equal(dbzFromRgba(0, 0, 0, 0), null);
assert.equal(radarActive(18), false);
assert.equal(radarActive(30), true);

const pan = popupPanDelta({
  x: 20,
  y: 40,
  mapWidth: 800,
  mapHeight: 600,
  popupWidth: 320,
  popupHeight: 420,
  padTop: 100,
  padBottom: 60,
  padX: 16,
});
assert.ok(pan.y < 0, "a popup pasted under the top bar pans the point downward");

const png = pngRgba(2, 1, [
  [255, 0, 0, 255],
  [0, 200, 0, 255],
]);
assert.deepEqual(readPngPixel(png, 0, 0), { r: 255, g: 0, b: 0, a: 255 });
assert.deepEqual(readPngPixel(png, 1, 0), { r: 0, g: 200, b: 0, a: 255 });

function pngRgba(width: number, height: number, pixels: number[][]) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  pixels.forEach((pixel, index) => {
    const row = Math.floor(index / width);
    const col = index % width;
    const at = row * (width * 4 + 1);
    raw[at] = 0;
    pixel.forEach((channel, channelIndex) => {
      raw[at + 1 + col * 4 + channelIndex] = channel;
    });
  });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4);
  const crc = crc32(Buffer.concat([Buffer.from(type), data]));
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([head, data, tail]);
}

function crc32(bytes: Buffer) {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc;
}
