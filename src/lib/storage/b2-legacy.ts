import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { STORAGE_KINDS, type StorageKind } from "@/lib/storage/kinds";
import { resolveB2Location } from "@/lib/storage/b2-region.mjs";
import { companyStoragePrefix, storageObjectKey } from "@/lib/storage/keys";
import { isCompanyId, legacyKindlessObjectKey, publicObjectUrl } from "@/lib/storage/urls";
import { isMissingStorageError, type StoredObject } from "@/lib/storage/object-body";

export function b2Config() {
  const keyId = process.env.B2_KEY_ID?.trim() || "";
  const applicationKey = process.env.B2_APPLICATION_KEY?.trim() || "";
  const bucket = process.env.B2_BUCKET?.trim() || "";
  const located = resolveB2Location({
    keyId,
    region: process.env.B2_REGION,
    endpoint: process.env.B2_ENDPOINT,
  });
  return {
    keyId,
    applicationKey,
    bucket,
    region: located.region,
    endpoint: located.endpoint,
  };
}

export function isB2Configured() {
  const { keyId, applicationKey, bucket, endpoint } = b2Config();
  return Boolean(keyId && applicationKey && bucket && endpoint);
}

/** Turn Backblaze's opaque invalid-key response into the region it was sent to. */
export function b2FailureMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (!/is not valid/i.test(message)) return message;
  const { endpoint, region } = b2Config();
  return `${message} This host is calling ${endpoint} (${region}). Use a non-master application key for that bucket in B2_KEY_ID and B2_APPLICATION_KEY.`;
}

let cachedClient: S3Client | null = null;

function getB2Client() {
  if (!isB2Configured()) {
    throw new Error(
      "Backblaze B2 is not configured. Set B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET, and B2_REGION.",
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
    // AWS SDK v3 checksums are not implemented by B2 and fail PutObject/GetObject
    // once the key is accepted. Send a checksum only when the operation requires one.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return cachedClient;
}

export async function getObjectFromB2(path: string): Promise<StoredObject> {
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
    body: result.Body ?? null,
    contentType: result.ContentType || "application/octet-stream",
    contentLength: result.ContentLength,
    cacheControl: result.CacheControl,
  };
}

export async function getObjectFromB2WithLegacy(path: string): Promise<StoredObject> {
  try {
    return await getObjectFromB2(path);
  } catch (error) {
    const fallback = isMissingStorageError(error) ? legacyKindlessObjectKey(path) : "";
    if (!fallback) throw error;
    return await getObjectFromB2(fallback);
  }
}

export async function uploadToB2(input: {
  companyId: string;
  kind: StorageKind;
  path: string;
  body: Buffer | Uint8Array;
  contentType: string;
}) {
  const client = getB2Client();
  const { bucket } = b2Config();
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

export async function removeFromB2(key: string) {
  const client = getB2Client();
  const { bucket } = b2Config();
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
  } catch (error) {
    if (!isMissingStorageError(error)) throw error;
  }
  return { ok: true as const };
}

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
          throw new Error(first?.Message || `Failed to delete some objects under ${prefix}`);
        }
      }
      token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (token);
  }

  return { ok: true as const, deleted, prefix: companyStoragePrefix(companyId) };
}
