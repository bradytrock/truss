import assert from "node:assert/strict";
import { railwayDatabaseEnabled, railwayFetchPlan } from "./railway-rest.ts";

const previous = process.env.NEXT_PUBLIC_USE_RAILWAY_DATABASE;

process.env.NEXT_PUBLIC_USE_RAILWAY_DATABASE = "";
assert.equal(railwayDatabaseEnabled(), false);
assert.equal(
  railwayFetchPlan("https://cxrgdjvkmvnuztubxldh.supabase.co/rest/v1/jobs?select=id"),
  "passthrough",
);
assert.equal(railwayFetchPlan("https://cxrgdjvkmvnuztubxldh.supabase.co/auth/v1/user"), "passthrough");
assert.equal(railwayFetchPlan("https://example.com/health"), "passthrough");

process.env.NEXT_PUBLIC_USE_RAILWAY_DATABASE = "0";
assert.equal(railwayDatabaseEnabled(), false);
process.env.NEXT_PUBLIC_USE_RAILWAY_DATABASE = "railway";
assert.equal(railwayDatabaseEnabled(), true);
assert.equal(
  railwayFetchPlan("https://cxrgdjvkmvnuztubxldh.supabase.co/rest/v1/jobs"),
  "database",
);
assert.equal(railwayFetchPlan("https://cxrgdjvkmvnuztubxldh.supabase.co/auth/v1/user"), "passthrough");
assert.equal(
  railwayFetchPlan("https://cxrgdjvkmvnuztubxldh.supabase.co/auth/v1/token?grant_type=password"),
  "passthrough",
);
assert.equal(
  railwayFetchPlan("https://cxrgdjvkmvnuztubxldh.supabase.co/realtime/v1/websocket"),
  "blocked",
);

if (previous === undefined) delete process.env.NEXT_PUBLIC_USE_RAILWAY_DATABASE;
else process.env.NEXT_PUBLIC_USE_RAILWAY_DATABASE = previous;

console.log("railway-rest tests passed");
