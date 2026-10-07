#!/usr/bin/env node
/**
 * Copy the Backblaze B2 bucket into a private Azure Blob container.
 *
 * Object keys stay `{companyId}/{kind}/…`. Postgres rows, `/api/storage/object`,
 * and the B2 bucket are left alone. Re-run the script until every object is
 * skipped; a later deploy can then point reads at Azure.
 *
 * Usage:
 *   node scripts/migrate-b2-to-azure.mjs --dry-run
 *   node scripts/migrate-b2-to-azure.mjs
 *   node scripts/migrate-b2-to-azure.mjs --prefix <company-uuid>/
 *   node scripts/migrate-b2-to-azure.mjs --verify
 *
 * Reads B2_* and AZURE_STORAGE_* from the environment or .env.local.
 * AZURE_STORAGE_CONNECTION_STRING + AZURE_STORAGE_CONTAINER, or
 * AZURE_STORAGE_ACCOUNT + AZURE_STORAGE_ACCOUNT_KEY + AZURE_STORAGE_CONTAINER.
 */
import { readFileSync, existsSync } from "node:fs";
import { Readable } from "node:stream";
import { resolve } from "node:path";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { BlobServiceClient } from "@azure/storage-blob";
import { resolveB2Location } from "../src/lib/storage/b2-region.mjs";
import { azureStorageConfig, describeAzureTarget } from "../src/lib/storage/azure-config.mjs";
import { azureCopyAction, parseMigrateArgs } from "../src/lib/storage/azure-copy.mjs";

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

const HELP = `Copy Backblaze objects into Azure Blob without changing app URLs.

  node scripts/migrate-b2-to-azure.mjs [--dry-run] [--verify]
      [--prefix company-uuid/] [--concurrency 4]

--dry-run   Compare keys and sizes. Do not create the container or upload.
--verify    Exit 1 if any B2 object is missing in Azure or a different size.
--prefix    Copy one company prefix instead of the whole bucket.
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

let args;
try {
  args = parseMigrateArgs(process.argv.slice(2));
} catch (error) {
  fail(error instanceof Error ? error.message : "Could not read arguments.");
}
if (args.help) {
  console.log(HELP);
  process.exit(0);
}

const keyId = process.env.B2_KEY_ID?.trim() || "";
const applicationKey = process.env.B2_APPLICATION_KEY?.trim() || "";
const bucket = process.env.B2_BUCKET?.trim() || "";
const located = resolveB2Location({
  keyId,
  region: process.env.B2_REGION,
  endpoint: process.env.B2_ENDPOINT,
});
if (!keyId || !applicationKey || !bucket) {
  fail("Set B2_KEY_ID, B2_APPLICATION_KEY, and B2_BUCKET.");
}

const azure = azureStorageConfig();
if (!azure.configured) {
  const hint = azure.container
    ? "Azure storage credentials are missing or the container name is invalid."
    : "Set AZURE_STORAGE_CONTAINER to the private container that will receive the copy.";
  fail(
    `${hint} Also set AZURE_STORAGE_CONNECTION_STRING, or AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCOUNT_KEY.`,
  );
}

const b2 = new S3Client({
  endpoint: located.endpoint,
  region: located.region,
  credentials: { accessKeyId: keyId, secretAccessKey: applicationKey },
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const service = BlobServiceClient.fromConnectionString(azure.connectionString);
const container = service.getContainerClient(azure.container);

function nodeReadable(body) {
  if (!body) return null;
  if (typeof body.pipe === "function") return body;
  if (typeof body.getReader === "function") return Readable.fromWeb(body);
  if (typeof body.transformToWebStream === "function") {
    return Readable.fromWeb(body.transformToWebStream());
  }
  return null;
}

async function listB2() {
  const objects = [];
  let token;
  do {
    const listed = await b2.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: args.prefix || undefined,
        ContinuationToken: token,
      }),
    );
    for (const item of listed.Contents || []) {
      if (!item.Key || item.Key.endsWith("/")) continue;
      objects.push({ key: item.Key, size: typeof item.Size === "number" ? item.Size : null });
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

async function listAzure() {
  const sizes = new Map();
  try {
    for await (const blob of container.listBlobsFlat({ prefix: args.prefix || undefined })) {
      sizes.set(blob.name, blob.properties.contentLength ?? null);
    }
  } catch (error) {
    const missing = error?.statusCode === 404 || error?.code === "ContainerNotFound";
    if (missing && args.dryRun) return sizes;
    if (missing) {
      fail(
        `Azure container ${describeAzureTarget(azure)} does not exist yet. Run without --dry-run to create it and copy.`,
      );
    }
    throw error;
  }
  return sizes;
}

async function copyOne(object) {
  const result = await b2.send(new GetObjectCommand({ Bucket: bucket, Key: object.key }));
  const headers = {
    blobContentType: result.ContentType || "application/octet-stream",
  };
  if (result.CacheControl) headers.blobCacheControl = result.CacheControl;
  const block = container.getBlockBlobClient(object.key);
  const stream = nodeReadable(result.Body);
  if (stream) {
    await block.uploadStream(stream, 4 * 1024 * 1024, 4, { blobHTTPHeaders: headers });
    return;
  }
  const bytes = result.Body ? await result.Body.transformToByteArray() : new Uint8Array();
  await block.uploadData(bytes, { blobHTTPHeaders: headers });
}

async function mapPool(items, limit, fn) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const current = next;
      next += 1;
      await fn(items[current], current);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
}

const target = describeAzureTarget(azure);
console.log(
  `${args.dryRun ? "Dry run" : args.verify ? "Verify" : "Copy"} ${bucket} → ${target}${
    args.prefix ? ` prefix ${args.prefix}` : ""
  }`,
);

if (!args.dryRun && !args.verify) {
  await container.createIfNotExists();
}

const source = await listB2();
const dest = await listAzure();
const plan = source.map((object) => ({
  object,
  action: azureCopyAction({ sourceSize: object.size, destSize: dest.has(object.key) ? dest.get(object.key) : null }),
}));
const copies = plan.filter((item) => item.action === "copy");
const skips = plan.length - copies.length;

if (args.verify) {
  console.log(`${source.length} in B2, ${skips} match, ${copies.length} missing or a different size.`);
  for (const item of copies.slice(0, 20)) {
    console.log(`  missing ${item.object.key}`);
  }
  if (copies.length > 20) console.log(`  … ${copies.length - 20} more`);
  process.exit(copies.length === 0 ? 0 : 1);
}

console.log(`${source.length} in B2, ${skips} already copied, ${copies.length} to upload.`);
if (args.dryRun) {
  for (const item of copies.slice(0, 20)) console.log(`  would copy ${item.object.key}`);
  if (copies.length > 20) console.log(`  … ${copies.length - 20} more`);
  process.exit(0);
}

let copied = 0;
let failed = 0;
await mapPool(copies, args.concurrency, async (item) => {
  try {
    await copyOne(item.object);
    copied += 1;
    console.log(`copied ${item.object.key}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : "upload failed";
    console.error(`failed ${item.object.key}: ${message}`);
  }
});

console.log(`Done. copied ${copied}, skipped ${skips}, failed ${failed}. B2 was not modified.`);
process.exit(failed === 0 ? 0 : 1);
