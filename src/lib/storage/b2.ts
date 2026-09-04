import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const STORAGE_KINDS = [
  "job-files",
  "job-photos",
  "receipts",
  "company-assets",
] as const;

export type StorageKind = (typeof STORAGE_KINDS)[number];

export function isStorageKind(value: string): value is StorageKind {
  return (STORAGE_KINDS as readonly string[]).includes(value);
}

export function b2Config() {
  const keyId = process.env.B2_KEY_ID?.trim() || "";
  const applicationKey = process.env.B2_APPLICATION_KEY?.trim() || "";
  const bucket = process.env.B2_BUCKET?.trim() || "";
  const region = process.env.B2_REGION?.trim() || "us-west-004";
  const endpoint =
    process.env.B2_ENDPOINT?.trim() ||
    (region ? `https://s3.${region}.backblazeb2.com` : "");
  const publicBaseUrl = process.env.B2_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "") || "";
  return { keyId, applicationKey, bucket, region, endpoint, publicBaseUrl };
}

export function isB2Configured() {
  const { keyId, applicationKey, bucket, endpoint } = b2Config();
  return Boolean(keyId && applicationKey && bucket && endpoint);
}

export function b2Status() {
  const cfg = b2Config();
  return {
    configured: isB2Configured(),
    bucket: cfg.bucket || null,
    region: cfg.region || null,
    endpoint: cfg.endpoint || null,
    publicBaseUrl: cfg.publicBaseUrl || null,
    /** True when URLs go through /api/storage/object (needed for private buckets). */
    proxied: !cfg.publicBaseUrl,
  };
}

let cachedClient: S3Client | null = null;

export function getB2Client() {
  if (!isB2Configured()) {
    throw new Error(
      "Backblaze B2 is not configured. Set B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET, and B2_REGION on the host.",
    );
  }
  if (cachedClient) return cachedClient;
  const { keyId, applicationKey, region, endpoint } = b2Config();
  cachedClient = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId: keyId,
      secretAccessKey: applicationKey,
    },
    forcePathStyle: true,
  });
  return cachedClient;
}

/** Object key inside the single B2 bucket. Kind becomes the first path segment. */
export function storageObjectKey(kind: StorageKind, path: string) {
  const clean = path.replace(/^\/+/, "").replace(/\\/g, "/");
  if (clean.startsWith(`${kind}/`)) return clean;
  return `${kind}/${clean}`;
}

/**
 * Browser/email URL for an object.
 * Prefer B2_PUBLIC_BASE_URL when the bucket is public; otherwise use the app proxy
 * (private buckets cannot be made public on unpaid Backblaze accounts).
 */
export function publicObjectUrl(kind: StorageKind, path: string, appOrigin?: string) {
  const key = storageObjectKey(kind, path);
  const { publicBaseUrl } = b2Config();
  if (publicBaseUrl) {
    return `${publicBaseUrl}/${key}`;
  }
  const origin = (appOrigin || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const proxy = `/api/storage/object?path=${encodeURIComponent(key)}`;
  return origin ? `${origin}${proxy}` : proxy;
}

export async function signedObjectUrl(kind: StorageKind | string, path: string, expiresIn = 60 * 60 * 24 * 7) {
  const client = getB2Client();
  const { bucket } = b2Config();
  let key = path.replace(/^\/+/, "");
  if (isStorageKind(kind) && !key.startsWith(`${kind}/`)) {
    key = storageObjectKey(kind, key);
  }
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn },
  );
}

export async function getObjectFromB2(path: string) {
  const client = getB2Client();
  const { bucket } = b2Config();
  const key = path.replace(/^\/+/, "");
  const result = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  return {
    key,
    body: result.Body,
    contentType: result.ContentType || "application/octet-stream",
    contentLength: result.ContentLength,
    cacheControl: result.CacheControl,
  };
}

export async function uploadToB2(input: {
  kind: StorageKind;
  path: string;
  body: Buffer | Uint8Array;
  contentType: string;
  /** App origin for durable proxy URLs when the bucket is private. */
  appOrigin?: string;
}) {
  const client = getB2Client();
  const { bucket } = b2Config();
  const key = storageObjectKey(input.kind, input.path);
  const body =
    input.body instanceof Buffer
      ? new Uint8Array(input.body.buffer, input.body.byteOffset, input.body.byteLength)
      : input.body;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: input.contentType || "application/octet-stream",
    }),
  );

  return {
    ok: true as const,
    kind: input.kind,
    bucket: `b2:${bucket}`,
    storagePath: key,
    url: publicObjectUrl(input.kind, key, input.appOrigin),
  };
}

export async function removeFromB2(input: { kind?: StorageKind | string; path: string }) {
  if (!input.path.trim()) return { ok: true as const };
  const client = getB2Client();
  const { bucket } = b2Config();
  let key = input.path.replace(/^\/+/, "");
  if (input.kind && isStorageKind(input.kind) && !key.startsWith(`${input.kind}/`)) {
    key = storageObjectKey(input.kind, key);
  }
  // Strip legacy "b2:bucket/" prefixes if ever stored that way.
  if (key.startsWith(`b2:${bucket}/`)) key = key.slice(`b2:${bucket}/`.length);

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  return { ok: true as const };
}
