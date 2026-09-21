import assert from "node:assert/strict";
import { boardScrollMetrics, scrollLeftFromTrack } from "./board-scroll.ts";

const fit = boardScrollMetrics(0, 800, 800);
assert.equal(fit.overflowing, false);
assert.equal(fit.thumbRatio, 1);
assert.equal(fit.thumbStart, 0);

const mid = boardScrollMetrics(200, 400, 800);
assert.equal(mid.overflowing, true);
assert.equal(mid.maxScroll, 400);
assert.ok(Math.abs(mid.thumbRatio - 0.5) < 1e-9);
assert.ok(Math.abs(mid.thumbStart - 0.25) < 1e-9);

const start = scrollLeftFromTrack(0.25, 400, 800);
assert.ok(Math.abs(start - 0) < 1e-6);
const end = scrollLeftFromTrack(1, 400, 800);
assert.ok(Math.abs(end - 400) < 1e-6);
assert.equal(scrollLeftFromTrack(0.5, 800, 800), 0);

console.log("board-scroll.test.ts ok");
