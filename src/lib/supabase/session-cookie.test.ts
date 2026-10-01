import assert from "node:assert/strict";
import {
  GATE_COOKIE,
  readAuthCookieSession,
  projectRefFromSupabaseUrl,
  TOKEN_REFRESH_LEEWAY_SEC,
} from "./session-cookie.ts";

assert.equal(projectRefFromSupabaseUrl("https://cxrgdjvkmvnuztubxldh.supabase.co"), "cxrgdjvkmvnuztubxldh");
assert.equal(projectRefFromSupabaseUrl("not a url"), "");
assert.equal(GATE_COOKIE, "truss-gate");
assert.ok(TOKEN_REFRESH_LEEWAY_SEC >= 60);

const now = 1_700_000_000;

function jwt(exp: number) {
  const payload = Buffer.from(JSON.stringify({ exp, sub: "user" })).toString("base64url");
  return `header.${payload}.sig`;
}

function sessionCookie(expiresAt: number) {
  return JSON.stringify({
    access_token: jwt(expiresAt),
    refresh_token: "refresh",
    expires_at: expiresAt,
  });
}

const fresh = readAuthCookieSession(
  [{ name: "sb-cxrgdjvkmvnuztubxldh-auth-token", value: sessionCookie(now + 3600) }],
  "cxrgdjvkmvnuztubxldh",
  now,
);
assert.equal(fresh.present, true);
assert.equal(fresh.fresh, true);
assert.equal(fresh.expiresAt, now + 3600);

const expiring = readAuthCookieSession(
  [{ name: "sb-cxrgdjvkmvnuztubxldh-auth-token", value: sessionCookie(now + 30) }],
  "cxrgdjvkmvnuztubxldh",
  now,
);
assert.equal(expiring.present, true);
assert.equal(expiring.fresh, false);

const encoded = `base64-${Buffer.from(sessionCookie(now + 3600)).toString("base64url")}`;
const fromEncoded = readAuthCookieSession(
  [
    { name: "sb-cxrgdjvkmvnuztubxldh-auth-token.0", value: encoded.slice(0, 20) },
    { name: "sb-cxrgdjvkmvnuztubxldh-auth-token.1", value: encoded.slice(20) },
  ],
  "cxrgdjvkmvnuztubxldh",
  now,
);
assert.equal(fromEncoded.fresh, true);

const missing = readAuthCookieSession([], "cxrgdjvkmvnuztubxldh", now);
assert.equal(missing.present, false);
assert.equal(missing.fresh, false);

const junk = readAuthCookieSession(
  [{ name: "sb-cxrgdjvkmvnuztubxldh-auth-token", value: "not-json" }],
  "cxrgdjvkmvnuztubxldh",
  now,
);
assert.equal(junk.present, true);
assert.equal(junk.fresh, false);

console.log("session-cookie.test.ts ok");
