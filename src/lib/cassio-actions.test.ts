import assert from "node:assert/strict";
import { CASSIO_SILENCE } from "./cassio-guard.ts";
import { runCassioAction } from "./cassio-actions.ts";

let calls = 0;
const text = await runCassioAction({
  name: "estimate_activity",
  args: { query: "Bryce" },
  token: "token",
  audience: "group",
  latestText: "Has Bryce opened it?",
  seedChatId: "iMessage;+;chat1",
  rpc: async () => {
    calls += 1;
    return { ok: true };
  },
  sendSeed: async () => {
    calls += 1;
    return true;
  },
  readBook: async () => {
    calls += 1;
    return "Bryce Jones estimate 1042 balance due $10";
  },
});
assert.equal(text, CASSIO_SILENCE);
assert.equal(calls, 0);

const seeds = await runCassioAction({
  name: "estimate_activity",
  args: { query: "Bryce" },
  token: "token",
  audience: "seeds",
  latestText: "Has Bryce opened it?",
  seedChatId: "iMessage;+;chat1",
  rpc: async () => {
    calls += 1;
    return { ok: true };
  },
  sendSeed: async () => true,
  readBook: async () => "Bryce Jones estimate 1042 opened once",
});
assert.equal(seeds, "Bryce Jones estimate 1042 opened once");
assert.equal(calls, 0);

const seedsMoney = await runCassioAction({
  name: "estimate_activity",
  args: { query: "Bryce" },
  token: "token",
  audience: "seeds",
  latestText: "What's the balance?",
  seedChatId: "iMessage;+;chat1",
  rpc: async () => ({ ok: true }),
  sendSeed: async () => true,
  readBook: async () => "Balance due $10",
});
assert.equal(seedsMoney, CASSIO_SILENCE);

const seedsWrite = await runCassioAction({
  name: "log_client_communication",
  args: { client: "Bryce Jones", kind: "note", body: "Called" },
  token: "token",
  audience: "seeds",
  latestText: "Leave a note on Bryce",
  seedChatId: "iMessage;+;chat1",
  rpc: async () => {
    calls += 1;
    return { ok: true };
  },
  sendSeed: async () => true,
  readBook: async () => "unused",
});
assert.match(seedsWrite, /private text/);
assert.equal(calls, 0);

const prepared = await runCassioAction({
  name: "log_client_communication",
  args: { client: "Bryce Jones", kind: "call", body: "Left a voicemail" },
  token: "token",
  audience: "owner_dm",
  latestText: "Log a call with Bryce Jones",
  seedChatId: "",
  rpc: async (name, args) => {
    if (name === "cassio_visible_client") {
      return { ok: true, clientId: "c1", name: "Bryce Jones", openJobId: "j1", openJobCode: "BJ081926-A" };
    }
    if (name === "cassio_action_remember") return { ok: true, summary: args.p_summary };
    return { ok: false };
  },
  sendSeed: async () => false,
  readBook: async () => "unused",
});
assert.match(prepared, /Reply YES/);
assert.match(prepared, /job BJ081926-A/);

console.log("cassio-actions.test.ts ok");
