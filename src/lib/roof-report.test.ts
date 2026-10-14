import assert from "node:assert/strict";
import { addFacet, emptyDrawing, setFacetPitch, setFeetPerPixel } from "./roof-measure.ts";
import {
  buildRoofReport,
  complexityLabel,
  facetLetter,
  formatThirdSquares,
  squaresToThirds,
  supplierMaterials,
  wasteColumns,
} from "./roof-report.ts";

assert.equal(facetLetter(0), "A");
assert.equal(facetLetter(23), "X");
assert.equal(facetLetter(25), "Z");
assert.equal(facetLetter(26), "AA");

assert.equal(formatThirdSquares(squaresToThirds(39.54)), "39.66");
assert.equal(formatThirdSquares(squaresToThirds(47.0526)), "47.33");
assert.equal(formatThirdSquares(squaresToThirds(47.8434)), "48.00");
assert.equal(formatThirdSquares(squaresToThirds(48.6342)), "48.66");

const columns = wasteColumns(3954, 21);
const recommended = columns.find((column) => column.recommended);
assert.equal(recommended?.percent, 21);
assert.equal(formatThirdSquares(recommended?.thirds ?? 0), "48.00");
assert.equal(formatThirdSquares(columns[0].thirds), "39.66");

const materials = supplierMaterials({
  orderThirds: 144,
  eavesFt: 297,
  hipsRidgesFt: 306,
  valleysFt: 123,
  dripFt: 402,
  stepFt: 72,
  lowSlopeSqFt: 237.8,
});
const qty = (name: string) => materials.find((line) => line.name === name)?.qty;
assert.equal(qty("Architectural shingles"), 144);
assert.equal(qty("Hip & ridge cap"), 11);
assert.equal(qty("Starter strip"), 4);
assert.equal(qty("Synthetic underlayment"), 5);
assert.equal(qty("Ice & water shield"), 2);
assert.equal(qty("Drip edge"), 45);
assert.equal(qty("Step flashing"), 175);
assert.equal(qty("Low-slope membrane"), 3);

let drawing = setFeetPerPixel(emptyDrawing(), 1);
drawing = {
  ...drawing,
  points: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 10, y: 0 },
    { id: "c", x: 10, y: 10 },
    { id: "d", x: 0, y: 10 },
    { id: "e", x: 10, y: 0 },
    { id: "f", x: 50, y: 0 },
    { id: "g", x: 50, y: 20 },
    { id: "h", x: 10, y: 20 },
  ],
};
drawing = addFacet(drawing, ["a", "b", "c", "d"]);
drawing = addFacet(drawing, ["e", "f", "g", "h"]);
const lowId = drawing.facets[0].id;
const steepId = drawing.facets[1].id;
drawing = setFacetPitch(drawing, lowId, 1);
drawing = setFacetPitch(drawing, steepId, 8);
drawing = { ...drawing, wastePercent: 21 };

const report = buildRoofReport(drawing);
assert.equal(report.calibrated, true);
assert.equal(report.facets.length, 2);
assert.equal(report.facets[0].letter, "A");
assert.equal(report.facets[1].letter, "B");
assert.ok(report.facets[0].surfaceSqFt < report.facets[1].surfaceSqFt);
assert.equal(report.facets[0].pitchRise, 1);
assert.equal(report.lowSlopeSqFt, report.facets[0].surfaceSqFt);
assert.equal(report.steepSqFt, report.facets[1].surfaceSqFt);
assert.equal(report.mainPitchRise, 8);
assert.equal(report.complexity, "simple");
assert.equal(complexityLabel(report.complexity), "simple cut");
assert.equal(report.lines.find((line) => line.kind === "eave")?.count, 8);
assert.ok(report.dripFeet > 0);
assert.equal(report.wastePercent, 21);

const flat = buildRoofReport(emptyDrawing());
assert.equal(flat.calibrated, false);
assert.equal(flat.orderThirds, 0);
assert.equal(flat.facets.length, 0);

console.log("roof-report tests passed");
