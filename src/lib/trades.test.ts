import assert from "node:assert/strict";
import {
  cleanOtherTradeName,
  encodeStoredTrades,
  normalizeTradePatch,
  otherTradeNameFrom,
  parseTrades,
  tradeSummary,
} from "./types.ts";

assert.deepEqual(parseTrades(["Roofing", "other", "nope", "other:Skylights"]), ["roofing", "other"]);
assert.equal(otherTradeNameFrom(["roofing", "other:  Skylights  "]), "Skylights");
assert.equal(cleanOtherTradeName("  Deck\nlights  "), "Deck lights");
assert.equal(cleanOtherTradeName("x".repeat(80)).length, 48);

assert.deepEqual(encodeStoredTrades(["gutters", "roofing"], ""), ["roofing", "gutters"]);
assert.deepEqual(encodeStoredTrades(["other", "roofing"], "Decking"), ["roofing", "other", "other:Decking"]);
assert.deepEqual(encodeStoredTrades(["other:Decking"], undefined), ["other", "other:Decking"]);
assert.equal(tradeSummary(["other:Decking", "roofing"]), "Roofing, Decking");
assert.equal(tradeSummary(["other", "roofing"], ""), "Roofing, Other");

const kept = normalizeTradePatch(
  { trades: ["roofing", "other"], otherTradeName: "Decking" },
  { trades: ["roofing", "gutters", "other"] },
);
assert.deepEqual(kept.trades, ["roofing", "gutters", "other"]);
assert.equal(kept.otherTradeName, "Decking");

const cleared = normalizeTradePatch(
  { trades: ["other"], otherTradeName: "Decking" },
  { trades: ["siding"] },
);
assert.deepEqual(cleared.trades, ["siding"]);
assert.equal(cleared.otherTradeName, "");

const untouched = normalizeTradePatch({ trades: ["roofing"], otherTradeName: "Decking" }, { name: "Porch" });
assert.equal(untouched.otherTradeName, undefined);
assert.equal(untouched.name, "Porch");
