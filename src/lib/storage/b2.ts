import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { STORAGE_KINDS, isStorageKind, type StorageKind } from "@/lib/storage/kinds";
import {
  isAllowedObjectKey,
  isCompanyId,
  publicObjectUrl,
} from "@/lib/storage/urls";

export { STORAGE_KINDS, isStorageKind, type StorageKind };
export {
  isAllowedObjectKey,
  isCompanyId,
  publicObjectUrl,
  resolveStoredFileUrl,
  storageProxyPath,
} from "@/lib/storage/urls";

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
    /** All company blobs live under `{companyId}/…` for easy offboarding. */
    layout: "company-first" as const,
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

/**
 * Canonical object key: `{companyId}/{kind}/…`
 *
 * Company id is always the first segment so offboarding is one prefix delete.
 * Accepts relative paths, company-relative paths, and legacy kind-first keys.
 */
export function storageObjectKey(companyId: string, kind: StorageKind, path: string) {
  if (!isCompanyId(companyId)) {
    throw new Error("Upload path needs a valid company id.");
  }
  const clean = path.replace(/^\/+/, "").replace(/\\/g, "/");
  if (!clean || clean.includes("..")) {
    throw new Error("Invalid storage path.");
  }

  if (clean.startsWith(`${companyId}/${kind}/`)) return clean;

  const legacyPrefix = `${kind}/${companyId}/`;
  if (clean.startsWith(legacyPrefix)) {
    return `${companyId}/${kind}/${clean.slice(legacyPrefix.length)}`;
  }

  if (clean.startsWith(`${companyId}/`)) {
    const rest = clean.slice(`${companyId}/`.length);
    if (rest.startsWith(`${kind}/`)) return `${companyId}/${rest}`;
    return `${companyId}/${kind}/${rest}`;
  }

  if (clean.startsWith(`${kind}/`)) {
    return `${companyId}/${clean}`;
  }

  return `${companyId}/${kind}/${clean}`;
}

/** Prefix that owns every blob for a company (trailing slash). */
export function companyStoragePrefix(companyId: string) {
  if (!isCompanyId(companyId)) {
    throw new Error("Company id is not a UUID.");
  }
  return `${companyId}/`;
}

export function companyIdFromObjectKey(path: string): string | null {
  const clean = path.replace(/^\/+/, "");
  const first = clean.split("/")[0] || "";
  if (isCompanyId(first)) return first;
  const parts = clean.split("/");
  if (parts.length >= 2 && isStorageKind(parts[0]) && isCompanyId(parts[1])) {
    return parts[1];
  }
  return null;
}

/** Kind segment for a canonical or legacy object key. */
export function storageKindFromObjectKey(path: string): StorageKind | null {
  const clean = path.replace(/^\/+/, "");
  const parts = clean.split("/");
  if (parts.length >= 2 && isCompanyId(parts[0]) && isStorageKind(parts[1])) {
    return parts[1];
  }
  if (parts.length >= 2 && isStorageKind(parts[0]) && isCompanyId(parts[1])) {
    return parts[0];
  }
  return null;
}

export async function signedObjectUrl(path: string, expiresIn = 60 * 60 * 24 * 7) {
  const client = getB2Client();
  const { bucket } = b2Config();
  const key = path.replace(/^\/+/, "");
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
  companyId: string;
  kind: StorageKind;
  path: string;
  body: Buffer | Uint8Array;
  contentType: string;
}) {
  const client = getB2Client();
  const { bucket, publicBaseUrl } = b2Config();
  const key = storageObjectKey(input.companyId, input.kind, input.path);
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
    url: publicObjectUrl(key),
  };
}

export async function removeFromB2(input: { path: string }) {
  if (!input.path.trim()) return { ok: true as const };
  const client = getB2Client();
  const { bucket } = b2Config();
  let key = input.path.replace(/^\/+/, "");
  if (key.startsWith(`b2:${bucket}/`)) key = key.slice(`b2:${bucket}/`.length);

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  return { ok: true as const };
}

/**
 * Delete every object under `{companyId}/` (and any leftover legacy
 * `{kind}/{companyId}/` keys). Use when a company asks to leave the platform.
 */
export async function purgeCompanyFromB2(companyId: string) {
  if (!isCompanyId(companyId)) {
    throw new Error("Company id is not a UUID.");
  }
  const client = getB2Client();
  const { bucket } = b2Config();
  const prefixes = [
    companyStoragePrefix(companyId),
    ...STORAGE_KINDS.map((kind) => `${kind}/${companyId}/`),
  ];

  let deleted = 0;
  for (const prefix of prefixes) {
    let token: string | undefined;
    do {
      const listed = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      const keys = (listed.Contents || [])
        .map((item) => item.Key)
        .filter((key): key is string => Boolean(key));
      for (let i = 0; i < keys.length; i += 1000) {
        const chunk = keys.slice(i, i + 1000);
        if (!chunk.length) continue;
        const result = await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: chunk.map((Key) => ({ Key })),
              Quiet: true,
            },
          }),
        );
        deleted += chunk.length - (result.Errors?.length ?? 0);
        if (result.Errors?.length) {
          const first = result.Errors[0];
          throw new Error(
            first?.Message || `Failed to delete some objects under ${prefix}`,
          );
        }
      }
      token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (token);
  }

  return { ok: true as const, deleted, prefix: companyStoragePrefix(companyId) };
}
