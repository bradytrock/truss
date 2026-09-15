import assert from "node:assert/strict";
import {
  groupHasMixedPackages,
  lineInPackage,
  listEstimateOptions,
  nextOptionKey,
  nextOptionName,
  optionKeyForGroup,
  parseLinePackage,
  resolveSelectedPackage,
  scopedEstimateLines,
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

console.log("estimate-packages tests passed");
