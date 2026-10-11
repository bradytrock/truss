#!/usr/bin/env node
/**
 * Purge every stored object for one company.
 *
 * Layout: `{companyId}/{kind}/…` — one prefix delete offboards that office.
 * Also clears leftover legacy `{kind}/{companyId}/…` keys.
 * Deletes from Azure Blob when AZURE_STORAGE_* is set, and from Backblaze
 * when B2_* is set.
 *
 * Usage:
 *   node scripts/purge-company-files.mjs <company-uuid>
 *
 * Reads env from the environment or .env.local.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import { resolveB2Location } from "../src/lib/storage/b2-region.mjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = [
  "job-files",
  "job-photos",
  "estimate-files",
  "invoice-files",
  "receipts",
  "company-assets",
  "company-files",
];

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

const prefixes = [`${companyId}/`, ...KINDS.map((kind) => `${kind}/${companyId}/`)];

function azureSettings() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim() || "";
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY?.trim() || "";
  const container = process.env.AZURE_STORAGE_CONTAINER?.trim() || "";
  const accountFromConnection = connectionString.match(/AccountName=([^;]+)/i)?.[1]?.trim() || "";
  const account = process.env.AZURE_STORAGE_ACCOUNT?.trim() || accountFromConnection;
  return {
    connectionString,
    account,
    accountKey,
    container,
    configured: Boolean(container && (connectionString || account)),
  };
}

async function azureContainer() {
  const cfg = azureSettings();
  if (!cfg.configured) return null;
  let service;
  if (cfg.connectionString) {
    service = BlobServiceClient.fromConnectionString(cfg.connectionString);
  } else if (cfg.accountKey) {
    service = new BlobServiceClient(
      `https://${cfg.account}.blob.core.windows.net`,
      new StorageSharedKeyCredential(cfg.account, cfg.accountKey),
    );
  } else {
    const { DefaultAzureCredential } = await import("@azure/identity");
    service = new BlobServiceClient(
      `https://${cfg.account}.blob.core.windows.net`,
      new DefaultAzureCredential(),
    );
  }
  return service.getContainerClient(cfg.container);
}

async function purgeAzure() {
  const container = await azureContainer();
  if (!container) return 0;
  let deleted = 0;
  for (const prefix of prefixes) {
    const keys = [];
    for await (const blob of container.listBlobsFlat({ prefix })) {
      if (blob.name) keys.push(blob.name);
    }
    for (let i = 0; i < keys.length; i += 256) {
      const chunk = keys.slice(i, i + 256);
      if (!chunk.length) continue;
      const result = await container.getBlobBatchClient().deleteBlobs(
        chunk.map((name) => container.getBlobClient(name)),
      );
      const failed = result.subResponses.filter((item) => item.status >= 400 && item.status !== 404);
      if (failed.length) {
        console.error(failed[0]?.statusMessage || failed[0]?.errorCode || "Azure delete failed");
        process.exit(1);
      }
      deleted += chunk.length;
    }
  }
  return deleted;
}

function b2Client() {
  const keyId = process.env.B2_KEY_ID?.trim() || "";
  const applicationKey = process.env.B2_APPLICATION_KEY?.trim() || "";
  const bucket = process.env.B2_BUCKET?.trim() || "";
  if (!keyId || !applicationKey || !bucket) return null;
  const { region, endpoint } = resolveB2Location({
    keyId,
    region: process.env.B2_REGION,
    endpoint: process.env.B2_ENDPOINT,
  });
  return {
    bucket,
    client: new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId: keyId, secretAccessKey: applicationKey },
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
  };
}

async function purgeB2() {
  const located = b2Client();
  if (!located) return 0;
  const { client, bucket } = located;
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
  return deleted;
}

if (!azureSettings().configured && !b2Client()) {
  console.error(
    "Set AZURE_STORAGE_CONTAINER and AZURE_STORAGE_CONNECTION_STRING, or the B2_KEY_ID / B2_APPLICATION_KEY / B2_BUCKET fallback.",
  );
  process.exit(1);
}

const deleted = (await purgeAzure()) + (await purgeB2());
console.log(`Deleted ${deleted} object(s) for company ${companyId}`);
