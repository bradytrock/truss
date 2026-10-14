import assert from "node:assert/strict";
import {
  addFacet,
  edgeKey,
  emptyDrawing,
  hitTest,
  measureRoof,
  setEdgeKind,
  setFacetPitch,
  slopeFactor,
} from "./roof-measure.ts";

const square = emptyDrawing();
const withPoints = {
  ...square,
  feetPerPixel: 1,
  points: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 100, y: 0 },
    { id: "c", x: 100, y: 100 },
    { id: "d", x: 0, y: 100 },
    { id: "e", x: 200, y: 0 },
    { id: "f", x: 200, y: 100 },
  ],
};

const one = addFacet(withPoints, ["a", "b", "c", "d"]);
const flat = measureRoof(setFacetPitch(one, one.facets[0].id, 0));
assert.equal(flat.squares, 100);
assert.equal(flat.lengths.eave, 400);
assert.equal(flat.predominantPitch, "0/12");

const pitched = measureRoof(setFacetPitch(one, one.facets[0].id, 12));
assert.equal(pitched.squares, Math.round(100 * slopeFactor(12) * 100) / 100);

const two = addFacet(one, ["b", "e", "f", "c"]);
const shared = two.edges.find((edge) => edgeKey(edge.a, edge.b) === edgeKey("b", "c"));
assert.equal(shared?.kind, "ridge");
const joined = measureRoof(two.facets.reduce((drawing, facet) => setFacetPitch(drawing, facet.id, 0), two));
assert.equal(joined.squares, 200);
assert.equal(joined.lengths.ridge, 100);
assert.equal(joined.lengths.eave, 600);

const hipDrawing = setEdgeKind(
  two.facets.reduce((drawing, facet) => setFacetPitch(drawing, facet.id, 12), two),
  shared?.id ?? "",
  "hip",
);
const hip = measureRoof(hipDrawing);
assert.equal(hip.lengths.hip, Math.round(100 * slopeFactor(12) * 100) / 100);
assert.equal(hip.lengths.ridge, 0);
assert.equal(hip.squares, Math.round(200 * slopeFactor(12) * 100) / 100);

const hit = hitTest(one, 50, 50, 8);
assert.equal(hit?.kind, "facet");
const corner = hitTest(one, 1, 1, 8);
assert.equal(corner?.kind, "point");

console.log("roof-measure tests passed");
