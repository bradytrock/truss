import assert from "node:assert/strict";
import { regionFromB2KeyId, resolveB2Location } from "./b2-region.mjs";

const eastKey = "005b73cb7dcc6070000000003";

assert.equal(regionFromB2KeyId(eastKey), "us-east-005");
assert.equal(regionFromB2KeyId("004024147e7d0760000000001"), "us-west-004");
assert.equal(regionFromB2KeyId("005b73cb7dcc"), "");
assert.equal(regionFromB2KeyId(""), "");

const migrated = resolveB2Location({
  keyId: eastKey,
  region: "us-west-004",
  endpoint: "https://s3.us-west-004.backblazeb2.com",
});
assert.equal(migrated.region, "us-east-005");
assert.equal(migrated.endpoint, "https://s3.us-east-005.backblazeb2.com");

const explicit = resolveB2Location({
  keyId: eastKey,
  region: "us-west-004",
  endpoint: "https://s3.us-east-005.backblazeb2.com/",
});
assert.equal(explicit.region, "us-east-005");
assert.equal(explicit.endpoint, "https://s3.us-east-005.backblazeb2.com");

const proxy = resolveB2Location({
  keyId: eastKey,
  endpoint: "https://b2-proxy.internal",
});
assert.equal(proxy.region, "us-east-005");
assert.equal(proxy.endpoint, "https://b2-proxy.internal");

const unset = resolveB2Location({});
assert.equal(unset.region, "us-east-005");
assert.equal(unset.endpoint, "https://s3.us-east-005.backblazeb2.com");

console.log("b2-region.test.ts ok");
