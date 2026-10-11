import assert from "node:assert/strict";
import {
  groupHasMixedPackages,
  lineInPackage,
  listEstimateOptions,
  nextClassicOrOptionKey,
  nextOptionKey,
  nextOptionName,
  optionKeyForGroup,
  optionNameForKey,
  parseLinePackage,
  pendingClassicPackages,
  recommendedOptionKey,
  resolveSelectedPackage,
  scopedEstimateLines,
  sharedPackageLines,
  uniquePackageLines,
  optionHighlightLabels,
  cheapestOptionKey,
  gbbPrintSections,
  gbbBanner,
  gbbCardIdentity,
  gbbCardOrder,
  gbbFeatureRows,
  gbbMonthlyAbout,
  gbbNoteFromIntro,
  gbbPriceNote,
} from "./estimate-packages.ts";

assert.equal(parseLinePackage(" opt_2 "), "opt_2");
assert.equal(parseLinePackage("better"), "better");
assert.equal(nextOptionKey(["good", "opt_1"]), "opt_2");
assert.equal(nextOptionName(["Roof", "Option 1"]), "Option 2");

const lines = [
  { package: "", groupName: "Tear-off" },
  { package: "opt_1", groupName: "Architectural" },
  { package: "opt_1", groupName: "Architectural" },
  { package: "opt_2", groupName: "Designer" },
];

assert.deepEqual(
  listEstimateOptions(lines, [{ key: "opt_3", name: "Impact" }]).map((item) => item.key),
  ["opt_1", "opt_2", "opt_3"],
);
assert.equal(listEstimateOptions(lines)[0]?.name, "Architectural");
assert.equal(optionKeyForGroup("Architectural", lines), "opt_1");
assert.equal(optionKeyForGroup("Tear-off", lines), "");
assert.equal(optionKeyForGroup("Impact", lines, [{ key: "opt_3", name: "Impact" }]), "opt_3");
assert.equal(groupHasMixedPackages(lines), true);
assert.equal(groupHasMixedPackages(lines.filter((line) => line.groupName === "Architectural")), false);

assert.equal(
  resolveSelectedPackage({ selectedPackage: "opt_2" }, lines),
  "opt_2",
);
assert.equal(
  resolveSelectedPackage({ selectedPackage: "better" }, lines),
  "opt_1",
);

const scoped = scopedEstimateLines({ packageMode: "gbb", selectedPackage: "opt_2" }, lines);
assert.deepEqual(
  scoped.map((line) => line.groupName),
  ["Tear-off", "Designer"],
);
assert.equal(lineInPackage({ package: "" }, "opt_1"), true);
assert.equal(lineInPackage({ package: "opt_2" }, "opt_1"), false);

const classic = scopedEstimateLines(
  { packageMode: "gbb", selectedPackage: "best" },
  [
    { package: "", groupName: "Demo" },
    { package: "good", groupName: "Roof" },
    { package: "best", groupName: "Roof" },
  ],
);
assert.deepEqual(
  classic.map((line) => `${line.groupName}:${line.package || "all"}`),
  ["Demo:all", "Roof:best"],
);

assert.deepEqual(
  scopedEstimateLines({ packageMode: "" }, lines).map((line) => line.package),
  ["", "opt_1", "opt_1", "opt_2"],
);

assert.equal(nextClassicOrOptionKey([]), "good");
assert.equal(nextClassicOrOptionKey(["good"]), "better");
assert.equal(nextClassicOrOptionKey(["good", "better", "best"]), "opt_1");
assert.equal(optionNameForKey("best", []), "Best");
assert.equal(optionNameForKey("opt_1", ["Good"]), "Option 1");
assert.deepEqual(
  pendingClassicPackages([{ package: "better", groupName: "Better" }]).map((item) => item.key),
  ["good", "best"],
);
assert.deepEqual(
  pendingClassicPackages([
    { package: "good", groupName: "Good" },
    { package: "better", groupName: "Better" },
    { package: "best", groupName: "Best" },
  ]),
  [],
);

assert.deepEqual(
  sharedPackageLines(lines).map((line) => line.groupName),
  ["Tear-off"],
);
assert.deepEqual(
  uniquePackageLines(lines, "opt_1").map((line) => line.groupName),
  ["Architectural", "Architectural"],
);
assert.deepEqual(
  optionHighlightLabels(
    [
      { package: "opt_1", title: "Architectural shingles" },
      { package: "opt_1", title: "Architectural shingles" },
      { package: "opt_1", title: "Ridge vent" },
      { package: "", title: "Tear-off" },
    ],
    "opt_1",
  ),
  ["Architectural shingles", "Ridge vent"],
);
assert.equal(recommendedOptionKey([{ key: "good" }, { key: "better" }, { key: "best" }]), "better");
assert.equal(recommendedOptionKey([{ key: "opt_1" }, { key: "opt_2" }, { key: "opt_3" }]), "opt_2");
assert.equal(recommendedOptionKey([{ key: "opt_1" }]), null);
assert.equal(
  cheapestOptionKey([{ key: "a" }, { key: "b" }], (key) => (key === "a" ? 9000 : 7000)),
  "b",
);

const printed = gbbPrintSections([
  { package: "", groupName: "Demo", title: "Tear-off" },
  { package: "good", groupName: "Good", title: "3-tab" },
  { package: "better", groupName: "Better", title: "Architectural" },
  { package: "best", groupName: "Best", title: "Designer" },
]);
assert.deepEqual(
  printed.map((section) => `${section.kind}:${section.name}:${section.lines.length}`),
  ["shared:Included in every option:1", "option:Good:1", "option:Better:1", "option:Best:1"],
);

const roof = [
  { package: "", title: "Full tear-off & decking inspection", sortOrder: 0 },
  { package: "", title: "New architectural shingles", sortOrder: 1 },
  { package: "best", groupName: "Storm Shield", title: "Class 4 impact-resistant shingles", sortOrder: 2 },
  { package: "better", groupName: "Full System", title: "Class 4 impact-resistant shingles", sortOrder: 2 },
  { package: "best", groupName: "Storm Shield", title: "Synthetic underlayment", sortOrder: 3 },
  { package: "better", groupName: "Full System", title: "Synthetic underlayment", sortOrder: 3 },
  { package: "best", groupName: "Storm Shield", title: "Ice & water shield in valleys", sortOrder: 4 },
  { package: "better", groupName: "Full System", title: "Ice & water shield in valleys", sortOrder: 4 },
  { package: "best", groupName: "Storm Shield", title: "Matched manufacturer system", sortOrder: 5 },
  { package: "best", groupName: "Storm Shield", title: "Upgraded attic ventilation", sortOrder: 6 },
  { package: "good", groupName: "Essential", title: "Upgraded attic ventilation", sortOrder: 6 },
  { package: "best", groupName: "Storm Shield", title: "15-year workmanship warranty", sortOrder: 7 },
  { package: "better", groupName: "Full System", title: "10-year workmanship warranty", sortOrder: 7 },
  { package: "good", groupName: "Essential", title: "5-year workmanship warranty", sortOrder: 7 },
];
const roofOptions = [
  { key: "good", name: "Good" },
  { key: "better", name: "Better" },
  { key: "best", name: "Best" },
];
const roofTotal = (key: string) => (key === "best" ? 24850 : key === "better" ? 19400 : 16200);

assert.deepEqual(
  gbbCardOrder(roofOptions, roofTotal).map((item) => item.key),
  ["best", "better", "good"],
);
assert.equal(gbbMonthlyAbout(24850), 297);
assert.equal(gbbMonthlyAbout(19400), 232);
assert.equal(gbbMonthlyAbout(16200), 194);
assert.equal(gbbMonthlyAbout(0), null);
assert.deepEqual(gbbBanner("best", roofOptions, roofTotal), {
  label: "Maximum protection",
  tone: "ink",
});
assert.deepEqual(gbbBanner("better", roofOptions, roofTotal), {
  label: "Most popular",
  tone: "popular",
});
assert.deepEqual(gbbBanner("good", roofOptions, roofTotal), {
  label: "Lowest investment",
  tone: "ink",
});
assert.deepEqual(gbbCardIdentity("best", roof, "Best"), {
  grade: "Best",
  title: "Storm Shield",
  tagline: "Built for the next hailstorm",
  chooseLabel: "Best",
});
assert.equal(gbbCardIdentity("good", [{ package: "good", groupName: "Good" }], "Good").grade, null);
assert.deepEqual(gbbPriceNote("best", roofOptions, roofTotal), {
  kind: "delta",
  amount: 5450,
  versus: "Better",
});
assert.deepEqual(gbbPriceNote("better", roofOptions, roofTotal), {
  kind: "delta",
  amount: 3200,
  versus: "Good",
});
assert.deepEqual(gbbPriceNote("good", roofOptions, roofTotal), { kind: "start" });

const features = gbbFeatureRows(roof, ["best", "better", "good"]);
assert.deepEqual(
  features.map((row) => row.key),
  [
    "full tear off decking inspection",
    "new architectural shingles",
    "class 4 impact resistant shingles",
    "synthetic underlayment",
    "ice water shield in valleys",
    "matched manufacturer system",
    "upgraded attic ventilation",
    "workmanship warranty",
  ],
);
assert.equal(features[2]?.labels.good, undefined);
assert.equal(features[2]?.labels.better, "Class 4 impact-resistant shingles");
assert.equal(features[6]?.labels.better, undefined);
assert.equal(features[6]?.labels.good, "Upgraded attic ventilation");
assert.equal(features[7]?.labels.best, "15-year workmanship warranty");
assert.equal(features[7]?.labels.better, "10-year workmanship warranty");
assert.equal(features[7]?.labels.good, "5-year workmanship warranty");
assert.equal(features[7]?.canonical, "15-year workmanship warranty");
assert.deepEqual(
  gbbNoteFromIntro("Why Class 4 matters in DFW\nImpact-resistant shingles take a harder hit."),
  {
    title: "Why Class 4 matters in DFW",
    body: "Impact-resistant shingles take a harder hit.",
  },
);
assert.equal(gbbNoteFromIntro("   "), null);

console.log("estimate-packages tests passed");
