import assert from "node:assert/strict";
import {
  HOME_MODULE_IDS,
  defaultHomeLayout,
  homeLayoutStorageKey,
  mergeHomeLayout,
  visibleHomeLayout,
} from "./home-layout.ts";

assert.ok(HOME_MODULE_IDS.includes("calendarDay"));
assert.ok(HOME_MODULE_IDS.includes("todaysWork"));

const ids = defaultHomeLayout().map((item) => item.id);
assert.ok(ids.indexOf("pipelinePath") < ids.indexOf("todaysWork"));
assert.ok(ids.indexOf("todaysWork") < ids.indexOf("calendarDay"));

const defaults = Object.fromEntries(defaultHomeLayout().map((item) => [item.id, item]));
assert.equal(defaults.todaysWork?.span, 6);
assert.equal(defaults.calendarDay?.span, 6);
assert.equal(defaults.calendarDay?.hidden, false);

const merged = mergeHomeLayout([
  { id: "salesKpis", hidden: false, span: 8 },
  { id: "todaysWork", hidden: false, span: 8 },
]);
assert.ok(merged.some((item) => item.id === "calendarDay"));
assert.equal(merged.find((item) => item.id === "todaysWork")?.span, 8);

const visible = visibleHomeLayout(defaultHomeLayout(), HOME_MODULE_IDS);
assert.ok(visible.some((item) => item.id === "calendarDay"));
assert.ok(visible.some((item) => item.id === "todaysWork"));

assert.match(homeLayoutStorageKey("co", "st"), /homeLayout\.v2/);

console.log("home-layout.test.ts ok");
