import assert from "node:assert/strict";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const url = "https://example.supabase.co";
const key = "sb_publishable_Fs_dTxYT2nBFYVjLLG6vpg_n5b_NSa1";
const accessToken = async () => "header.payload.signature";

assert.throws(
  () =>
    createServerClient(url, key, {
      accessToken,
      cookies: {
        getAll: () => [],
        setAll() {},
      },
    }),
  /onAuthStateChange is not possible/,
);

const client = createClient(url, key, {
  accessToken,
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
assert.equal(typeof client.from, "function");
assert.throws(() => client.auth.getUser(), /accessToken option/);

console.log("clerk access token tests passed");
