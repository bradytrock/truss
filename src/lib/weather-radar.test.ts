import assert from "node:assert/strict";
import { radarFrameLabel, radarFrames, radarTileUrl } from "./weather-radar.ts";

const frames = radarFrames();

assert.deepEqual(
  frames.map((frame) => frame.minutesAgo),
  [50, 40, 30, 20, 10, 0],
);
assert.equal(frames[0]?.label, "50 min ago");
assert.equal(frames.at(-1)?.label, "Now");
assert.equal(radarFrameLabel(0), "Now");
assert.ok((frames.at(-1)?.holdMs ?? 0) > (frames[0]?.holdMs ?? 0));
assert.equal(
  radarTileUrl(0),
  "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png",
);
assert.equal(
  radarTileUrl(5),
  "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913-m05m/{z}/{x}/{y}.png",
);
assert.match(radarTileUrl(50), /nexrad-n0q-900913-m50m\/\{z\}\/\{x\}\/\{y\}\.png$/);
assert.throws(() => radarTileUrl(3), /Unsupported radar frame/);
assert.throws(() => radarTileUrl(60), /Unsupported radar frame/);
assert.throws(() => radarTileUrl(-5), /Unsupported radar frame/);

console.log("weather-radar tests passed");
