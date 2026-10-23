import assert from "node:assert/strict";
import {
  availableJobTags,
  customJobTag,
  filterJobTags,
  jobTagSuggestions,
  STARTER_JOB_TAGS,
} from "./job-tags.ts";

const suggestions = jobTagSuggestions([
  ["Insurance", "hail"],
  ["insurance", "Park Hill"],
  ["hail", "roof"],
]);

assert.deepEqual(suggestions.slice(0, 4), ["hail", "Insurance", "Park Hill", "roof"]);
assert.ok(suggestions.includes("roof"));
assert.ok(suggestions.includes("storm"));
assert.equal(suggestions.filter((tag) => tag.toLowerCase() === "insurance").length, 1);
assert.ok(suggestions.indexOf("Park Hill") < suggestions.indexOf("storm"));

const open = availableJobTags(suggestions, ["Hail"]);
assert.equal(open.includes("hail"), false);
assert.equal(open.includes("Insurance"), true);

assert.deepEqual(filterJobTags(["insurance", "siding", "fire"], "in"), ["insurance", "siding"]);
assert.deepEqual(filterJobTags(["insurance"], "  "), ["insurance"]);

assert.equal(customJobTag("  Park Hill  ", suggestions), null);
assert.equal(customJobTag("hail", ["Hail"]), null);
assert.equal(customJobTag("  gutters  ", suggestions), "gutters");
assert.equal(customJobTag("   ", STARTER_JOB_TAGS), null);

console.log("job-tags.test.ts ok");
