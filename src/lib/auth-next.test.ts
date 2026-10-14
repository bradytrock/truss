import assert from "node:assert/strict";
import { destinationAfterSignIn, originFromHeaders, safeNextPath } from "./auth-next.ts";

assert.equal(safeNextPath(null), "/");
assert.equal(safeNextPath(""), "/");
assert.equal(safeNextPath("https://evil.example"), "/");
assert.equal(safeNextPath("//evil.example"), "/");
assert.equal(safeNextPath("/\\evil"), "/");
assert.equal(safeNextPath("/jobs?job=1"), "/jobs?job=1");

assert.equal(destinationAfterSignIn("/jobs", false), "/jobs");
assert.equal(destinationAfterSignIn("https://evil.example", true), "/?welcome=1");
assert.equal(destinationAfterSignIn("/jobs?job=1", true), "/jobs?job=1&welcome=1");
assert.equal(destinationAfterSignIn("/estimates/abc", true), "/estimates/abc?welcome=1");

const headers = (values: Record<string, string>) => ({
  get(name: string) {
    return values[name.toLowerCase()] ?? null;
  },
});
assert.equal(
  originFromHeaders(headers({ host: "myroofingtools.com", "x-forwarded-proto": "https" }), "http://0.0.0.0:3847"),
  "https://myroofingtools.com",
);
assert.equal(
  originFromHeaders(headers({ "x-forwarded-host": "127.0.0.1:3847" }), "http://0.0.0.0:3847"),
  "http://127.0.0.1:3847",
);
assert.equal(originFromHeaders(headers({}), "http://0.0.0.0:3847"), "http://0.0.0.0:3847");

console.log("auth-next.test.ts ok");
