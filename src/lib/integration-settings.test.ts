import assert from "node:assert/strict";
import { integrationSettingsHome, integrationSettingsTabs } from "./integration-settings.ts";

const adminTabs = integrationSettingsTabs(true).map((tab) => tab.id);
assert.deepEqual(adminTabs, ["eagleview", "companycam", "stripe", "messaging", "quickbooks"]);
assert.deepEqual(
  integrationSettingsTabs(false).map((tab) => tab.id),
  ["quickbooks"],
);
assert.equal(integrationSettingsHome(true), "/settings/integrations/eagleview");
assert.equal(integrationSettingsHome(false), "/settings/integrations/quickbooks");

console.log("integration-settings.test.ts ok");
