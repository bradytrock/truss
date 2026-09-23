import assert from "node:assert/strict";
import {
  parseEagleviewReportText,
  parseSuggestedWaste,
  parseSuggestedWasteFromItems,
  type EagleviewTextItem,
} from "./eagleview-parse.ts";

const FLAT_TABLE = `
REPORT SUMMARY
Lengths, Areas and Pitches
Total Area (All Pitches) = 3,966
Waste Calculation
NOTE: This waste calculation table is for asphalt shingle roofing applications.
Waste % 0% 6% 11% 16% 19% 21% 23% 26% 31%
Area (sq ft) 3954 4192 4389 4588 4706 4786 4866 4983 5180
Squares * 39.66 42.00 44.00 46.00 47.33 48.00 48.66 50.00 52.00
Measured Suggested
`;

const ALIGNED_TABLE = `
Waste Calculation
Waste %          0%      6%     11%     16%     19%     21%     23%     26%     31%
Area (sq ft)  3954    4192    4389    4588    4706    4786    4866    4983    5180
Squares *     39.66   42.00   44.00   46.00   47.33   48.00   48.66   50.00   52.00
              Measured                              Suggested
`;

const adjacent = parseSuggestedWaste(`
Waste Calculation
Waste % 0% 6% 11% 16% 19% 21% 23% 26% 31%
Squares * 39.66 42.00 44.00 46.00 47.33 48.00 48.66 50.00 52.00
21% Suggested
`);
assert.equal(adjacent.wastePercent, 21);
assert.equal(adjacent.suggestedSquares, 48);

const aligned = parseSuggestedWaste(ALIGNED_TABLE);
assert.equal(aligned.wastePercent, 21);
assert.equal(aligned.suggestedSquares, 48);
assert.equal(aligned.measuredSquares, 39.66);

const flat = parseSuggestedWaste(FLAT_TABLE);
assert.notEqual(flat.wastePercent, 6);
assert.notEqual(flat.suggestedSquares, 42);

const xs = [10, 40, 70, 100, 130, 160, 190, 220, 250];
const percents = [0, 6, 11, 16, 19, 21, 23, 26, 31];
const squares = [39.66, 42, 44, 46, 47.33, 48, 48.66, 50, 52];
const items: EagleviewTextItem[] = [
  { str: "Waste %", x: 0, y: 200, page: 1 },
  ...percents.map((waste, index) => ({ str: `${waste}%`, x: xs[index]!, y: 200, page: 1 })),
  { str: "Squares *", x: 0, y: 160, page: 1 },
  ...squares.map((square, index) => ({ str: square.toFixed(2), x: xs[index]!, y: 160, page: 1 })),
  { str: "Measured", x: xs[0]!, y: 140, page: 1 },
  { str: "Suggested", x: xs[5]!, y: 140, page: 1 },
];
const fromItems = parseSuggestedWasteFromItems(items);
assert.equal(fromItems.wastePercent, 21);
assert.equal(fromItems.suggestedSquares, 48);
assert.equal(fromItems.measuredSquares, 39.66);

const parsed = parseEagleviewReportText(ALIGNED_TABLE, [ALIGNED_TABLE]);
assert.equal(parsed.wastePercent, 21);
assert.equal(parsed.suggestedSquares, 48);

const parsedItems = parseEagleviewReportText(FLAT_TABLE, [FLAT_TABLE], items);
assert.equal(parsedItems.wastePercent, 21);
assert.equal(parsedItems.suggestedSquares, 48);

console.log("eagleview-parse.test.ts ok");
