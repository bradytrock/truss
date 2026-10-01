import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PHOTON_NOT_CONNECTED,
  isSqlScript,
  looksLikePhotonProjectId,
  looksLikePhotonProjectSecret,
  photonNotSetupMessage,
  photonSecretHint,
} from "./photon.ts";

const projectId = "6a4d2e8c-7b1f-4d3a-9a8e-2c5d6f7e8a9b";

assert.equal(looksLikePhotonProjectId(projectId), true);
assert.equal(looksLikePhotonProjectId(`  ${projectId}  `), true);
assert.equal(looksLikePhotonProjectId("not-a-project"), false);
assert.equal(looksLikePhotonProjectId(""), false);
assert.equal(looksLikePhotonProjectSecret("secret-key"), true);
assert.equal(looksLikePhotonProjectSecret("short"), false);
assert.equal(looksLikePhotonProjectSecret("has a space-in-it"), false);
assert.equal(photonSecretHint("project-secret-91af"), "91af");
assert.equal(
  photonNotSetupMessage("T Rock Roofing"),
  "Photon is not set up for T Rock Roofing.",
);
assert.match(PHOTON_NOT_CONNECTED, /Settings → Photon/);
assert.equal(isSqlScript("New Chat"), false);
assert.equal(isSqlScript("New Chat\r\nAutomations"), false);
assert.equal(isSqlScript("-- Photon\ncreate table public.photon_connections ();"), true);

const migration = readFileSync(
  new URL("../../supabase/migrations/20260930120000_photon_connections.sql", import.meta.url),
  "utf8",
);
assert.equal(migration.trimStart().startsWith("--"), true);
assert.equal(isSqlScript(migration), true);
assert.doesNotMatch(migration.split(/\r?\n/, 1)[0] ?? "", /^New Chat/);
assert.match(migration, /create table if not exists public\.photon_connections/);
