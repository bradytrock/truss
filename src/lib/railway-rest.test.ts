import assert from "node:assert/strict";
import { restApiTarget, restSuffix } from "./railway-rest.ts";

assert.equal(restSuffix("https://cxrgdjvkmvnuztubxldh.supabase.co/rest/v1/jobs?id=eq.1"), "/jobs?id=eq.1");
assert.equal(restSuffix("https://db.example/auth/v1/token"), null);
assert.equal(
  restApiTarget("https://db.example/rest/v1/rpc/company_subscription_active", "browser", true),
  "/rest/v1/rpc/company_subscription_active",
);
assert.equal(
  restApiTarget("https://db.example/rest/v1/companies?select=id", "server", true),
  "http://127.0.0.1:3210/companies?select=id",
);
assert.equal(restApiTarget("https://db.example/rest/v1/companies", "browser", false), null);
assert.equal(restApiTarget("https://db.example/auth/v1/user", "browser", true), null);

console.log("railway-rest tests passed");
