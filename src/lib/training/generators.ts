// Numeric generators ported from the e-course. Tuple picks are mixed on purpose.
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import type { GeneratedQuestion, Rand } from "./types";

export type Generator = { cat: string; gen: (R: Rand) => GeneratedQuestion };

export const GENERATORS: Record<string, Generator[]> = {
  measuring: [
        {
          cat: "Area takeoff",
          gen: (R: Rand) => {
            const pitches = [["4/12", 1.054], ["5/12", 1.083], ["6/12", 1.118], ["7/12", 1.158], ["8/12", 1.202], ["9/12", 1.25], ["10/12", 1.302]];
            const p = R.pick(pitches);
            const L = R.int(9, 16) * 4, W = R.int(6, 11) * 4;
            const plan = L * W;
            const actual = Math.round(plan * p[1]);
            return {
              q: "A house footprint (including overhangs) measures " + L + "' × " + W + "' — " + plan.toLocaleString() + " sq ft of plan area. The roof is " + p[0] + " (slope factor " + p[1] + "). Actual roof area is about:",
              a: [actual.toLocaleString() + " sq ft", plan.toLocaleString() + " sq ft", Math.round(plan / p[1]).toLocaleString() + " sq ft", Math.round(actual * 1.25).toLocaleString() + " sq ft"],
              x: "Plan area " + plan.toLocaleString() + " sq ft \u00d7 factor " + p[1] + " = " + actual.toLocaleString() + " sq ft of real roof.",
              correct: 0
            };
          }
        },
        {
          cat: "Hips, valleys & waste",
          gen: (R: Rand) => {
            const area = R.int(14, 34) * 100;
            const waste = R.pick([10, 12, 15]);
            const total = Math.ceil(area * (1 + waste / 100) / 100);
            return {
              q: "Net roof area is " + area.toLocaleString() + " sq ft on a cut-up hip roof. Adding " + waste + "% waste, how many squares of material should you order (round up)?",
              a: [total + " squares", Math.ceil(area / 100) + " squares", (total + 3) + " squares", Math.ceil(area * (1 - waste / 100) / 100) + " squares"],
              x: area.toLocaleString() + " sq ft \u00d7 " + (1 + waste / 100) + " waste, \u00f7 100 = " + total + " squares, rounded up.",
              correct: 0
            };
          }
        }
      ],
  sheathing: [
        {
          cat: "Estimating decking",
          gen: (R: Rand) => {
            const area = R.int(15, 32) * 100;
            const waste = R.pick([5, 8, 10]);
            const sheets = Math.ceil(area * (1 + waste / 100) / 32);
            return {
              q: "You're re-decking " + area.toLocaleString() + " sq ft of roof with 4x8 panels (32 sq ft each) plus " + waste + "% cutting waste. How many sheets do you order (round up)?",
              a: [sheets + " sheets", Math.ceil(area / 32) + " sheets", (sheets + 8) + " sheets", Math.ceil(area / 48) + " sheets"],
              x: area.toLocaleString() + " sq ft \u00d7 " + (1 + waste / 100) + " \u00f7 32 sq ft per sheet = " + sheets + " sheets, rounded up.",
              correct: 0
            };
          }
        }
      ],
  underlayment: [
        {
          cat: "Estimating dry-in",
          gen: (R: Rand) => {
            const area = R.int(16, 36) * 100;
            const cov = R.pick([[10, "a 10-square synthetic roll"], [4, "No. 15 felt (4 squares/roll)"]]);
            const rolls = Math.ceil(area / 100 / cov[0]);
            return {
              q: "Dry-in for " + area.toLocaleString() + " sq ft of roof using " + cov[1] + ". Minimum rolls needed (round up)?",
              a: [rolls + " rolls", (rolls + 4) + " rolls", Math.max(1, rolls - 1) + " rolls", Math.ceil(area / 100) + " rolls"],
              x: (area / 100) + " squares \u00f7 " + cov[0] + " squares per roll = " + rolls + " rolls, rounded up.",
              correct: 0
            };
          }
        }
      ],
  asphalt: [
        {
          cat: "Estimating shingles",
          gen: (R: Rand) => {
            const sq = R.int(15, 40);
            const waste = R.pick([10, 15]);
            const bundles = Math.ceil(sq * (1 + waste / 100)) * 3;
            return {
              q: "A roof measures " + sq + " squares net. With " + waste + "% waste and 3 bundles per square, how many bundles of laminate do you order?",
              a: [bundles + " bundles", (sq * 3) + " bundles", (bundles + 9) + " bundles", Math.ceil(sq * 1.5) * 3 + " bundles"],
              x: "ceil(" + sq + " \u00d7 " + (1 + waste / 100) + ") squares \u00d7 3 bundles = " + bundles + " bundles.",
              correct: 0
            };
          }
        },
        {
          cat: "Estimating shingles",
          gen: (R: Rand) => {
            const sq = R.int(18, 38);
            const layers = R.pick([1, 1, 2]);
            const perSq = 300;
            const tons = (sq * layers * perSq / 2000);
            const tonsR = Math.round(tons * 10) / 10;
            return {
              q: "Tear-off: " + sq + " squares, " + layers + " layer" + (layers > 1 ? "s" : "") + " of asphalt at ~" + perSq + " lbs per square-layer. Approximate debris weight?",
              a: [tonsR + " tons", Math.round(tonsR * 2 * 10) / 10 + " tons", Math.round(sq * 10) / 10 + " tons", Math.round(tonsR / 2 * 10) / 10 + " tons"],
              x: sq + " squares \u00d7 " + layers + " layer(s) \u00d7 " + perSq + " lbs \u00f7 2,000 = " + tonsR + " tons.",
              correct: 0
            };
          }
        }
      ],
  rollroofing: [
        {
          cat: "Estimating roll roofing",
          gen: (R: Rand) => {
            const sq = R.int(3, 12);
            const mode = R.pick([["single coverage (~1 square net per roll)", 1], ["double coverage (~1/2 square net per roll)", 2]]);
            const rolls = Math.ceil(sq * mode[1] * 1.1);
            return {
              q: "A " + sq + "-square shed roof gets " + mode[0] + " with 10% waste. How many rolls do you order (round up)?",
              a: [rolls + " rolls", (rolls + 4) + " rolls", Math.max(1, rolls - 2) + " rolls", (sq) + " rolls"],
              x: sq + " squares \u00d7 " + mode[1] + " roll(s) per square \u00d7 1.1 waste = " + rolls + " rolls, rounded up.",
              correct: 0
            };
          }
        }
      ],
  wood: [
        {
          cat: "Estimating wood roofs",
          gen: (R: Rand) => {
            const sq = R.int(12, 26);
            const waste = R.pick([10, 15]);
            const bundles = Math.ceil(sq * (1 + waste / 100) * 5);
            return {
              q: "Shake roof: " + sq + " squares at 5 bundles per square with " + waste + "% waste. Bundles to order (round up)?",
              a: [bundles + " bundles", (sq * 5) + " bundles", (bundles + 12) + " bundles", (sq * 3) + " bundles"],
              x: "ceil(" + sq + " \u00d7 " + (1 + waste / 100) + ") \u00d7 5 bundles per square = " + bundles + " bundles.",
              correct: 0
            };
          }
        }
      ],
  tile: [
        {
          cat: "Estimating tile",
          gen: (R: Rand) => {
            const sq = R.int(18, 40);
            const lbs = R.pick([600, 800, 950, 1100]);
            const tons = Math.round(sq * lbs / 2000 * 10) / 10;
            return {
              q: "A " + sq + "-square tile roof at " + lbs.toLocaleString() + " lbs per square puts how much total load on the structure?",
              a: [tons + " tons", Math.round(tons / 2 * 10) / 10 + " tons", Math.round(tons * 2 * 10) / 10 + " tons", sq + " tons"],
              x: sq + " squares \u00d7 " + lbs.toLocaleString() + " lbs \u00f7 2,000 = " + tons + " tons of dead load.",
              correct: 0
            };
          }
        }
      ],
  slate: [
        {
          cat: "Estimating slate",
          gen: (R: Rand) => {
            const len = R.pick([16, 18, 20, 22, 24]);
            const lap = R.pick([3, 4]);
            const exp = (len - lap) / 2;
            return {
              q: "A " + len + "\" slate installed with " + lap + "\" headlap runs what exposure?",
              a: [exp + "\"", (len / 2) + "\"", (exp + 1) + "\"", lap + "\""],
              x: "(" + len + "\" \u2212 " + lap + "\" headlap) \u00f7 2 = " + exp + "\" exposure.",
              correct: 0
            };
          }
        }
      ],
  metal: [
        {
          cat: "Estimating metal",
          gen: (R: Rand) => {
            const w = R.pick([[12, '12"'], [16, '16"'], [18, '18"'], [24, '24"']]);
            const eave = R.int(30, 90);
            const panels = Math.ceil(eave * 12 / w[0]);
            return {
              q: "A roof plane has a " + eave + "' eave. Using " + w[1] + "-coverage standing seam panels, how many panels does the plane take (round up)?",
              a: [panels + " panels", (panels - 3) + " panels", (panels + 3) + " panels", (panels + 10) + " panels"],
              x: eave + "' \u00d7 12 \u00f7 " + w[0] + "\" coverage = " + panels + " panels, rounded up.",
              correct: 0
            };
          }
        }
      ],
  lowslope: [
        {
          cat: "Mod-bit & torch work",
          gen: (R: Rand) => {
            const sq = R.int(12, 45);
            const waste = R.pick([8, 10, 12]);
            const rolls = Math.ceil(sq * (1 + waste / 100)) * 2;
            return {
              q: "A two-layer mod-bit system (base + cap, each ~1 square net per roll) over " + sq + " squares with " + waste + "% for laps/waste. Total rolls (round up)?",
              a: [rolls + " rolls", sq * 2 + " rolls", (rolls / 2) + " rolls", (rolls + 15) + " rolls"],
              x: "ceil(" + sq + " \u00d7 " + (1 + waste / 100) + ") squares \u00d7 2 layers = " + rolls + " rolls.",
              correct: 0
            };
          }
        }
      ],
  singleply: [
        {
          cat: "Details & estimating",
          gen: (R: Rand) => {
            const sq = R.int(40, 160);
            const rolls = Math.ceil(sq * 1.1 / 10);
            return {
              q: "A mechanically attached TPO roof measures " + sq + " squares. Using 10' x 100' rolls (10 squares gross) with 10% for laps and details, how many rolls (round up)?",
              a: [rolls + " rolls", (rolls + 6) + " rolls", Math.max(1, rolls - 3) + " rolls", sq + " rolls"],
              x: sq + " squares \u00d7 1.1 \u00f7 10 squares per roll = " + rolls + " rolls, rounded up.",
              correct: 0
            };
          }
        }
      ],
  insulation: [
        {
          cat: "Insulation & R-value",
          gen: (R: Rand) => {
            const m = R.pick([[3.5, "cellulose (~R-3.5/inch)"], [2.5, "blown fiberglass (~R-2.5/inch)"]]);
            const target = R.pick([38, 49, 60]);
            const inches = Math.ceil(target / m[0]);
            return {
              q: "You're topping an attic up to R-" + target + " using " + m[1] + ". About how many total inches of fill does that take (round up)?",
              a: [inches + " inches", Math.ceil(inches / 2) + " inches", (inches + 8) + " inches", target + " inches"],
              x: "R-" + target + " \u00f7 " + m[0] + " per inch = " + inches + " inches, rounded up.",
              correct: 0
            };
          }
        }
      ],
  coatings: [
        {
          cat: "Application & restoration",
          gen: (R: Rand) => {
            const sq = R.int(30, 120);
            const rate = R.pick([1.5, 2, 2.5]);
            const gals = Math.ceil(sq * rate);
            return {
              q: "A silicone spec calls for " + rate + " gallons per square at final dry-film thickness. For a " + sq + "-square roof, how many gallons (round up)?",
              a: [gals + " gallons", Math.ceil(gals / 2) + " gallons", (gals + 15) + " gallons", (gals + 40) + " gallons"],
              x: sq + " squares \u00d7 " + rate + " gal/sq = " + gals + " gallons, rounded up.",
              correct: 0
            };
          }
        }
      ],
  repair: [
        {
          cat: "Re-roofing decisions",
          gen: (R: Rand) => {
            const sq = R.int(20, 45);
            const layers = R.pick([1, 2]);
            const tons = sq * layers * 300 / 2000;
            const cap = R.pick([10, 12]);
            const dumpsters = Math.ceil(tons / cap);
            return {
              q: "Tear-off: " + sq + " squares, " + layers + " layer" + (layers > 1 ? "s" : "") + " at ~300 lbs per square-layer, hauled in " + cap + "-ton dumpsters. How many dumpster loads (round up)?",
              a: [dumpsters + " load" + (dumpsters > 1 ? "s" : ""), (dumpsters + 2) + " loads", Math.max(1, dumpsters - 1) + " load(s)", (dumpsters + 5) + " loads"],
              x: sq + " \u00d7 " + layers + " \u00d7 300 lbs \u00f7 2,000 = " + (Math.round(tons * 10) / 10) + " tons \u00f7 " + cap + "-ton loads = " + dumpsters + ".",
              correct: 0
            };
          }
        },
        {
          cat: "Attic ventilation",
          gen: (R: Rand) => {
            const attic = R.int(12, 30) * 100;
            const nfa = Math.round(attic / 150 * 144);
            return {
              q: "An attic floor measures " + attic.toLocaleString() + " sq ft. At the 1/150 baseline, how much net free vent area is required (in square inches)?",
              a: [nfa.toLocaleString() + " sq in", Math.round(nfa / 2).toLocaleString() + " sq in", (attic).toLocaleString() + " sq in", Math.round(nfa * 2).toLocaleString() + " sq in"],
              x: attic.toLocaleString() + " sq ft \u00f7 150 \u00d7 144 = " + nfa.toLocaleString() + " sq in of NFA.",
              correct: 0
            };
          }
        },
        {
          cat: "Gutters & drainage",
          gen: (R: Rand) => {
            const area = R.int(18, 42) * 100;
            const ds = Math.ceil(area / 600);
            return {
              q: "A roof drains " + area.toLocaleString() + " sq ft to its gutters. Using 2\"×3\" downspouts at one per ~600 sq ft, how many downspouts minimum?",
              a: [ds + " downspouts", Math.max(1, ds - 2) + " downspouts", (ds + 4) + " downspouts", "1 downspout"],
              x: area.toLocaleString() + " sq ft \u00f7 600 per downspout = " + ds + ", rounded up.",
              correct: 0
            };
          }
        }
      ],
  estimating: [
        {
          cat: "Overhead & profit",
          gen: (R: Rand) => {
            const dc = R.int(8, 24) * 1000;
            const oh = R.pick([20, 25, 30]);
            const pf = R.pick([8, 10, 12]);
            const price = Math.round(dc * (1 + oh / 100) * (1 + pf / 100));
            return {
              q: "Direct costs are $" + dc.toLocaleString() + ". Overhead is " + oh + "% and target profit is " + pf + "%. Using Price = DC × (1+OH) × (1+P), the bid price is about:",
              a: ["$" + price.toLocaleString(), "$" + Math.round(dc * (1 + (oh + pf) / 100)).toLocaleString(), "$" + Math.round(dc * (1 + pf / 100)).toLocaleString(), "$" + Math.round(dc * 2).toLocaleString()],
              x: "$" + dc.toLocaleString() + " \u00d7 " + (1 + oh / 100) + " overhead \u00d7 " + (1 + pf / 100) + " profit = $" + price.toLocaleString() + ".",
              correct: 0
            };
          }
        },
        {
          cat: "Direct costs & labor",
          gen: (R: Rand) => {
            const wage = R.pick([22, 25, 28, 30]);
            const burden = R.pick([35, 40, 45]);
            const loaded = Math.round(wage * (1 + burden / 100) * 100) / 100;
            return {
              q: "A roofer earns $" + wage + "/hr and your labor burden (taxes, comp, benefits) is " + burden + "%. The loaded rate you must estimate with is:",
              a: ["$" + loaded.toFixed(2) + "/hr", "$" + wage.toFixed(2) + "/hr", "$" + (wage + 5).toFixed(2) + "/hr", "$" + (wage * 2).toFixed(2) + "/hr"],
              x: "$" + wage + "/hr \u00d7 " + (1 + burden / 100) + " burden = $" + loaded.toFixed(2) + "/hr.",
              correct: 0
            };
          }
        }
      ],
};
