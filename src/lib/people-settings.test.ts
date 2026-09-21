import assert from "node:assert/strict";
import {
  PEOPLE_SETTINGS_TABS,
  peopleSettingsTab,
  peopleSettingsTabIsActive,
} from "./people-settings.ts";

assert.deepEqual(
  PEOPLE_SETTINGS_TABS.map((tab) => tab.id),
  ["people", "teams"],
);

assert.equal(peopleSettingsTab("/settings/people"), "people");
assert.equal(peopleSettingsTab("/settings/people/"), "people");
assert.equal(peopleSettingsTab("/settings/people/teams"), "teams");
assert.equal(peopleSettingsTab("/settings/people/teams/"), "teams");

assert.equal(peopleSettingsTabIsActive("/settings/people", "/settings/people"), true);
assert.equal(peopleSettingsTabIsActive("/settings/people", "/settings/people/teams"), false);
assert.equal(peopleSettingsTabIsActive("/settings/people/teams", "/settings/people/teams"), true);
assert.equal(peopleSettingsTabIsActive("/settings/people/teams", "/settings/people"), false);

console.log("people-settings.test.ts ok");
