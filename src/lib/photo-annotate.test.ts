import assert from "node:assert/strict";
import {
  arrowHead,
  clamp01,
  cropFromPoints,
  defaultStrokeWidth,
  ellipseFromPoints,
  hasAnnotations,
  mapPointThroughCrop,
  normalizeCrop,
  pointFromRect,
  strokePath,
} from "./photo-annotate.ts";

assert.equal(clamp01(-0.2), 0);
assert.equal(clamp01(1.4), 1);
assert.equal(clamp01(0.3), 0.3);

const point = pointFromRect(150, 120, { left: 100, top: 100, width: 200, height: 100 });
assert.deepEqual(point, { x: 0.25, y: 0.2 });
assert.equal(pointFromRect(0, 0, { left: 0, top: 0, width: 0, height: 10 }), null);

const crop = cropFromPoints({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.1 });
assert.equal(crop.x, 0.2);
assert.equal(crop.y, 0.1);
assert.ok(Math.abs(crop.w - 0.6) < 1e-9);
assert.ok(Math.abs(crop.h - 0.6) < 1e-9);

const box = normalizeCrop({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 });
assert.ok(box.x + box.w <= 1.0001);
assert.ok(box.y + box.h <= 1.0001);

assert.deepEqual(mapPointThroughCrop({ x: 0.5, y: 0.5 }, { x: 0.2, y: 0.1, w: 0.4, h: 0.2 }), {
  x: 0.4,
  y: 0.2,
});

const head = arrowHead({ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, 0.1);
assert.ok(head.left.x < 1);
assert.ok(head.right.x < 1);

const oval = ellipseFromPoints({ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.4 });
assert.ok(Math.abs(oval.cx - 0.4) < 1e-9);
assert.ok(Math.abs(oval.cy - 0.3) < 1e-9);
assert.ok(Math.abs(oval.rx - 0.2) < 1e-9);
assert.ok(Math.abs(oval.ry - 0.1) < 1e-9);

assert.equal(defaultStrokeWidth("highlight"), 0.028);
assert.equal(hasAnnotations([], null), false);
assert.equal(hasAnnotations([], { x: 0, y: 0, w: 1, h: 1 }), false);
assert.equal(hasAnnotations([], { x: 0.1, y: 0, w: 0.8, h: 1 }), true);
assert.equal(
  hasAnnotations([{ kind: "text", color: "#fff", point: { x: 0.1, y: 0.1 }, text: "Hail", size: 0.04 }], null),
  true,
);
assert.equal(strokePath([{ x: 0, y: 0 }, { x: 1, y: 1 }]), "0,0 1,1");

console.log("photo-annotate.test.ts ok");
