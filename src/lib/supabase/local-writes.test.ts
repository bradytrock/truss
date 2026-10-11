import assert from "node:assert/strict";
import {
  changedRowId,
  idsFromRestUrl,
  liveRefreshDecision,
  markRestWrite,
  noteLocalRow,
  observeRestWrite,
  resetLocalWriteEchoes,
  restWriteTarget,
  shouldSkipLiveRefresh,
} from "./local-writes.ts";

resetLocalWriteEchoes();

assert.deepEqual(idsFromRestUrl("https://db.example/rest/v1/jobs?id=eq.job-1"), ["job-1"]);
assert.deepEqual(
  idsFromRestUrl("https://db.example/rest/v1/tasks?id=in.(a,b)&select=*"),
  ["a", "b"],
);
assert.deepEqual(idsFromRestUrl("https://db.example/rest/v1/jobs?company_id=eq.co"), []);

assert.equal(
  restWriteTarget("https://db.example/rest/v1/jobs?id=eq.job-1", { method: "GET" }),
  null,
);
assert.equal(
  restWriteTarget("https://db.example/rest/v1/rpc/ingest", { method: "POST", body: "{}" }),
  null,
);
const write = restWriteTarget("https://db.example/rest/v1/opportunities", {
  method: "POST",
  body: JSON.stringify({ name: "Smith" }),
});
assert.equal(write?.method, "POST");

assert.equal(shouldSkipLiveRefresh([]), false);
assert.equal(shouldSkipLiveRefresh(["job-1"]), false);
observeRestWrite(
  { url: "https://db.example/rest/v1/opportunities", body: JSON.stringify({ id: "opp-1" }) },
  { ok: true, body: { id: "opp-1" } },
);
observeRestWrite(
  { url: "https://db.example/rest/v1/jobs?id=eq.job-1", body: null },
  { ok: true, body: [{ id: "job-1" }] },
);
assert.equal(shouldSkipLiveRefresh(["opp-1", "job-1"]), true);
assert.equal(shouldSkipLiveRefresh(["opp-1", "someone-else"]), false);
assert.equal(shouldSkipLiveRefresh([""]), false);

observeRestWrite(
  { url: "https://db.example/rest/v1/contacts", body: JSON.stringify({ id: "nope" }) },
  { ok: false, body: { id: "nope" } },
);
assert.equal(shouldSkipLiveRefresh(["nope"]), false);

noteLocalRow("fresh");
assert.equal(liveRefreshDecision(["fresh"], 0), "skip");
markRestWrite();
assert.equal(liveRefreshDecision(["remote-1"], 0), "wait");
assert.equal(liveRefreshDecision(["remote-1"], 1), "refresh");
assert.equal(liveRefreshDecision([""], 0), "refresh");

assert.equal(changedRowId({ new: { id: "n" }, old: { id: "o" } }), "n");
assert.equal(changedRowId({ new: {}, old: { id: "o" } }), "o");
assert.equal(changedRowId({ new: { id: 4 } }), "");

console.log("local-writes.test.ts ok");
