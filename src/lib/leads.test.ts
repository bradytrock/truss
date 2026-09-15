import assert from "node:assert/strict";
import { DEFAULT_LEAD_STATE, formatJobSite, leadStateOrDefault } from "./leads.ts";

assert.equal(DEFAULT_LEAD_STATE, "TX");
assert.equal(leadStateOrDefault(""), "TX");
assert.equal(leadStateOrDefault("   "), "TX");
assert.equal(leadStateOrDefault(undefined), "TX");
assert.equal(leadStateOrDefault("OK"), "OK");
assert.equal(leadStateOrDefault(" ok "), "ok");
assert.equal(
  formatJobSite({ street: "100 Main", city: "Plano", state: leadStateOrDefault(""), postalCode: "75074" }),
  "100 Main, Plano, TX 75074",
);

console.log("leads.test.ts ok");
