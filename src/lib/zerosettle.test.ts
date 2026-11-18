import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cassioAgentBody,
  cassioBookUrl,
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
assert.equal(single.active, true);
assert.equal(resolveCassioLine(single, "").ok, true);

const paidRestLine = parseCassioLine({
  handle: "+18055550100",
  profile: { name: "Example App" },
  usage: { new_contacts: { used: 1, limit: 5, period: "day" } },
});
assert.equal(paidRestLine.active, true, "a paid line omits active");

const readyWithoutFlag = parseCassioLine({ handle: "+18055550100", onboarding: "ready" });
assert.equal(readyWithoutFlag.active, true);

const stillSubscribing = parseCassioLine({
  active: false,
  onboarding: "subscribe",
  handle: "+18055550100",
});
assert.equal(stillSubscribing.active, false);

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
assert.match(body.business_context, /cannot send estimates, invoices, or payments/);
assert.match(body.business_context, /Stay silent/);
assert.match(body.business_context, /private text/);
assert.match(body.business_context, /verified Seeds group/);
assert.doesNotMatch(body.business_context, /\$\d/);
assert.match(body.business_context, /estimate_activity/);
assert.match(body.business_context, /recent_updates/);
assert.doesNotMatch(body.business_context, /did not give you a fact/);
assert.doesNotMatch(body.business_context, /photon/i);
assert.equal(cassioBookUrl("http://localhost:3847"), "");
assert.equal(cassioBookUrl("https://localhost:3847"), "");
assert.equal(cassioBookUrl("https://truss.example"), "https://truss.example/api/cassio/mcp");
assert.equal(
  cassioBookUrl("http://127.0.0.1:3847", "https://truss.example"),
  "https://truss.example/api/cassio/mcp",
);
assert.doesNotMatch(body.first_message.join("\n"), /photon/i);
assert.equal(body.timezone, "America/Chicago");

assert.match(zerosettleFailure(402, null).message, /Subscribe/);
assert.match(
  zerosettleFailure(402, { error: { code: "ai_credits_exhausted", message: "Out of credits." } }).message,
  /Out of credits/,
);
assert.doesNotMatch(
  zerosettleFailure(402, { error: { code: "ai_credits_exhausted", message: "Out of credits." } }).message,
  /not paid/,
);
assert.equal(zerosettleFailure(401, { error: { code: "unauthorized" } }).code, "unauthorized");

const migration = readFileSync(
  new URL("../../supabase/migrations/20261117170000_cassio_zerosettle_lines.sql", import.meta.url),
  "utf8",
);
assert.match(migration, /create table if not exists public\.cassio_lines/);
assert.match(migration, /crm_updates boolean not null default false/);
assert.match(migration, /group_messages boolean not null default false/);
assert.doesNotMatch(migration, /photon/i);

const book = readFileSync(new URL("../../supabase/migrations/20261117180000_cassio_book.sql", import.meta.url), "utf8");
assert.match(book, /cassio_estimate_activity/);
assert.match(book, /cassio_recent_updates/);
assert.match(book, /revoke all on function public\.cassio_line_send_target\(uuid\) from public, anon, authenticated/);
assert.doesNotMatch(book, /photon/i);

const actions = readFileSync(new URL("../../supabase/migrations/20261117190000_cassio_actions.sql", import.meta.url), "utf8");
assert.match(actions, /seed_chat_id/);
assert.match(actions, /cassio_seed_save/);
assert.match(actions, /cassio_action_commit/);
assert.doesNotMatch(actions, /contract_value/);
assert.doesNotMatch(actions, /photon/i);

const noteOnJob = readFileSync(
  new URL("../../supabase/migrations/20261117200000_cassio_note_on_job.sql", import.meta.url),
  "utf8",
);
assert.match(noteOnJob, /entity_type, entity_id, type, body, author/);
assert.match(noteOnJob, /'job', v_job/);
assert.match(noteOnJob, /cassio_open_job/);
assert.doesNotMatch(noteOnJob, /photon/i);

for (const file of [
  "./zerosettle.ts",
  "./zerosettle-server.ts",
  "./cassio-mcp.ts",
  "./cassio-guard.ts",
  "./cassio-actions.ts",
  "../app/api/cassio/line/route.ts",
  "../app/api/cassio/mcp/route.ts",
  "../app/api/cassio/seed/route.ts",
  "../app/api/cron/cassio-seed/route.ts",
]) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  assert.doesNotMatch(source, /photon/i, file);
}

console.log("zerosettle.test.ts ok");
