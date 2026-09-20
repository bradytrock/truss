import assert from "node:assert/strict";
import {
  angleInSweep,
  donutIndexAt,
  nearestChartIndex,
  pointerInViewBox,
} from "./home-chart-motion.ts";

assert.equal(nearestChartIndex(10, []), -1);
assert.equal(nearestChartIndex(12, [0, 10, 20]), 1);
assert.equal(nearestChartIndex(19, [0, 10, 20]), 2);
assert.equal(nearestChartIndex(-4, [0, 10, 20]), 0);

assert.deepEqual(
  pointerInViewBox(50, 25, { left: 0, top: 0, width: 100, height: 50 }, 200, 100),
  { x: 100, y: 50 },
);

assert.equal(angleInSweep(-Math.PI / 2, -Math.PI / 2, 0), true);
assert.equal(angleInSweep(0.1, -Math.PI / 2, 0), false);
assert.equal(angleInSweep(Math.PI, Math.PI * 0.75, Math.PI * 1.25), true);

assert.equal(
  donutIndexAt(90, 30, 90, 90, 38, 68, [
    { start: -Math.PI / 2, end: 0 },
    { start: 0, end: Math.PI },
  ]),
  0,
);

console.log("home-chart-motion.test.ts ok");
