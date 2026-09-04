#!/usr/bin/env node
/**
 * Purge every Backblaze object for one company.
 *
 * Layout: `{companyId}/{kind}/…` — one prefix delete offboards that office.
 * Also clears any leftover legacy `{kind}/{companyId}/…` keys.
 *
 * Usage:
 *   node scripts/purge-company-files.mjs <company-uuid>
 *
 * Reads B2_* from the environment or .env.local.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = ["job-files", "job-photos", "receipts", "company-assets"];

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const companyId = (process.argv[2] || "").trim();
if (!UUID_RE.test(companyId)) {
  console.error("Usage: node scripts/purge-company-files.mjs <company-uuid>");
  process.exit(1);
}

const keyId = process.env.B2_KEY_ID?.trim() || "";
const applicationKey = process.env.B2_APPLICATION_KEY?.trim() || "";
const bucket = process.env.B2_BUCKET?.trim() || "";
const region = process.env.B2_REGION?.trim() || "us-west-004";
const endpoint =
  process.env.B2_ENDPOINT?.trim() || `https://s3.${region}.backblazeb2.com`;

if (!keyId || !applicationKey || !bucket) {
  console.error("Set B2_KEY_ID, B2_APPLICATION_KEY, and B2_BUCKET.");
  process.exit(1);
}

const client = new S3Client({
  endpoint,
  region,
  credentials: { accessKeyId: keyId, secretAccessKey: applicationKey },
  forcePathStyle: true,
});

const prefixes = [`${companyId}/`, ...KINDS.map((kind) => `${kind}/${companyId}/`)];

let deleted = 0;
for (const prefix of prefixes) {
  let token;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    const keys = (listed.Contents || []).map((item) => item.Key).filter(Boolean);
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      if (!chunk.length) continue;
      const result = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      if (result.Errors?.length) {
        console.error(result.Errors[0]);
        process.exit(1);
      }
      deleted += chunk.length;
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
}

console.log(`Deleted ${deleted} object(s) for company ${companyId}`);
