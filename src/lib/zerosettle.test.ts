import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cassioAgentBody,
  cassioLineQuery,
  cassioTimezone,
  looksLikeZerosettleToken,
  parseCassioLine,
  resolveCassioLine,
  zerosettleFailure,
  zerosettleTokenHint,
} from "./zerosettle.ts";

assert.equal(looksLikeZerosettleToken("zs_mcp_example_token_value"), true);
assert.equal(looksLikeZerosettleToken("short"), false);
assert.equal(looksLikeZerosettleToken("has a space in the token"), false);
assert.equal(zerosettleTokenHint("zs_mcp_example_91af"), "91af");
assert.equal(cassioTimezone("America/Chicago"), "America/Chicago");
assert.equal(cassioTimezone("Not/AZone"), "America/New_York");
assert.equal(cassioTimezone(""), "America/New_York");

const single = parseCassioLine({
  active: true,
  handle: "+18055550100",
  your_number: "+13125550111",
  profile: { name: "Example App" },
  ai_credits: { left: 500 },
});
assert.equal(single.lines.length, 1);
assert.equal(single.lines[0]?.number, "+18055550100");
assert.equal(single.creditsLeft, 500);
assert.equal(resolveCassioLine(single, "").ok, true);

const many = parseCassioLine({
  active: true,
  handle: "+18055550100",
  lines: [
    { id: "ln_one", number: "+18055550100", group_id: "lg_shared" },
    { id: "ln_two", number: "+18055550111", group_id: "lg_shared" },
    { id: "ln_three", number: "+18055550122", group_id: "lg_own" },
  ],
});
const needsChoice = resolveCassioLine(many, "");
assert.equal(needsChoice.ok, false);
if (!needsChoice.ok) assert.equal(needsChoice.code, "choose_line");
const shared = resolveCassioLine(many, "ln_two");
assert.equal(shared.ok, true);
if (shared.ok) {
  assert.equal(shared.sharesSender, true);
  assert.equal(cassioLineQuery(shared.choice), "?group=lg_shared");
}
const own = resolveCassioLine(many, "ln_three");
assert.equal(own.ok, true);
if (own.ok) assert.equal(own.sharesSender, false);

const body = cassioAgentBody({ companyName: "Northline", seatName: "Maya Chen", timeZone: "America/Chicago" });
assert.equal(body.managed_by, "zerosettle");
assert.equal(body.goal_enabled, false);
assert.deepEqual(body.triggers, []);
assert.match(body.business_context, /Maya Chen/);
assert.match(body.business_context, /Northline/);
assert.match(body.business_context, /cannot change jobs/);
assert.doesNotMatch(body.business_context, /photon/i);
assert.doesNotMatch(body.first_message.join("\n"), /photon/i);
assert.equal(body.timezone, "America/Chicago");

assert.match(zerosettleFailure(402, null).message, /Subscribe/);
assert.equal(zerosettleFailure(401, { error: { code: "unauthorized" } }).code, "unauthorized");

const migration = readFileSync(
  new URL("../../supabase/migrations/20261117170000_cassio_zerosettle_lines.sql", import.meta.url),
  "utf8",
);
assert.match(migration, /create table if not exists public\.cassio_lines/);
assert.match(migration, /crm_updates boolean not null default false/);
assert.match(migration, /group_messages boolean not null default false/);
assert.doesNotMatch(migration, /photon/i);

for (const file of ["./zerosettle.ts", "./zerosettle-server.ts", "../app/api/cassio/line/route.ts"]) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  assert.doesNotMatch(source, /photon/i, file);
}

console.log("zerosettle.test.ts ok");
