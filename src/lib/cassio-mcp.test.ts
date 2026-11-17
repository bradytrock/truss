import assert from "node:assert/strict";
import { formatEstimateActivity, formatRecentUpdates, handleCassioMcp } from "./cassio-mcp.ts";

const opened = formatEstimateActivity({
  ok: true,
  seat: "Maya Chen",
  matches: [
    {
      contact: "Bryce Jones",
      estimate: "1042",
      name: "Roof",
      status: "viewed",
      sentAt: "2026-11-16T15:00:00Z",
      job: "BJ081926-A",
      address: "12 Oak St",
      opens: 1,
      lastOpenedAt: "2026-11-17T18:04:00Z",
    },
  ],
});
assert.match(opened, /Maya Chen/);
assert.match(opened, /Bryce Jones/);
assert.match(opened, /opened 1 time/);
assert.match(opened, /1042/);

assert.match(formatEstimateActivity({ ok: true, matches: [] }), /No estimate/);
assert.match(formatEstimateActivity({ ok: false, error: "This number is not connected to a Truss book." }), /not connected/);
assert.match(formatRecentUpdates({ ok: true, seat: "Maya", matches: [] }), /last 14 days/);

const listed = await handleCassioMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, async () => "unused");
const tools = (listed.body as { result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] } }).result
  .tools;
assert.equal(tools.length, 5);
assert.equal(tools.filter((tool) => tool.annotations.readOnlyHint).length, 2);
assert.equal(tools.some((tool) => tool.name === "share_lead_status" && tool.annotations.readOnlyHint === false), true);

const called = await handleCassioMcp(
  { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "estimate_activity", arguments: { query: "Bryce" } } },
  async (name, args) => `${name}:${args.query}`,
);
assert.match(JSON.stringify(called.body), /estimate_activity:Bryce/);

const note = await handleCassioMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, async () => "unused");
assert.equal(note.status, 202);
assert.equal(note.body, null);

console.log("cassio-mcp.test.ts ok");
