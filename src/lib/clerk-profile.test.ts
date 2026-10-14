import assert from "node:assert/strict";
import { decodeJwtPayload, profileIdFromJwt } from "./clerk-profile.ts";

const profileId = "11111111-1111-4111-8111-111111111111";
const supabaseId = "22222222-2222-4222-8222-222222222222";

assert.equal(profileIdFromJwt({ profile_id: profileId, sub: "user_abc" }), profileId);
assert.equal(profileIdFromJwt({ sub: supabaseId }), supabaseId);
assert.equal(profileIdFromJwt({ profile_id: "not-a-uuid", sub: supabaseId }), supabaseId);
assert.equal(profileIdFromJwt({ sub: "user_abc" }), null);
assert.equal(profileIdFromJwt(null), null);

const payload = Buffer.from(
  JSON.stringify({ profile_id: profileId, sub: "user_abc" }),
  "utf8",
).toString("base64url");
assert.equal(profileIdFromJwt(decodeJwtPayload(`aa.${payload}.bb`)), profileId);
assert.equal(decodeJwtPayload("not-a-jwt"), null);

console.log("clerk-profile tests passed");
