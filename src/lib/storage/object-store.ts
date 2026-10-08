import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { STORAGE_KINDS, isStorageKind, type StorageKind } from "@/lib/storage/kinds";
import {
  b2Config,
  b2FailureMessage,
  getObjectFromB2WithLegacy,
  isB2Configured,
  purgeCompanyFromB2,
  removeFromB2,
  uploadToB2,
} from "@/lib/storage/b2-legacy";
import { companyStoragePrefix, objectKeyFromStoredPath, storageObjectKey } from "@/lib/storage/keys";
import { isMissingStorageError, readableToBytes, type StoredObject } from "@/lib/storage/object-body";
import {
  isBlobWrapperPrefix,
  isCompanyId,
  prefixedStorageKeys,
  publicObjectUrl,
  storageReadKeys,
} from "@/lib/storage/urls";

export { STORAGE_KINDS, isStorageKind, type StorageKind };
export { isB2Configured, b2Config, b2FailureMessage };

export const STORAGE_NOT_CONFIGURED =
  "Azure Blob Storage is not configured. Set AZURE_STORAGE_CONTAINER and either AZURE_STORAGE_CONNECTION_STRING, AZURE_STORAGE_ACCOUNT plus AZURE_STORAGE_ACCOUNT_KEY, or AZURE_STORAGE_ACCOUNT for a managed identity. B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET, and B2_REGION still serve files until Azure is set.";

export function azureConfig() {
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

export function isAzureConfigured() {
  return azureConfig().configured;
}

export function isStorageConfigured() {
  return isAzureConfigured() || isB2Configured();
}

export function storageStatus() {
  const azure = azureConfig();
  const b2 = b2Config();
  const azureOn = isAzureConfigured();
  const b2On = isB2Configured();
  return {
    configured: azureOn || b2On,
    provider: azureOn ? ("azure" as const) : b2On ? ("backblaze" as const) : null,
    bucket: azureOn ? azure.container : b2On ? b2.bucket : null,
    account: azureOn ? azure.account || null : null,
    region: azureOn ? null : b2On ? b2.region || null : null,
    endpoint: azureOn && azure.account ? `https://${azure.account}.blob.core.windows.net` : b2On ? b2.endpoint : null,
    publicBaseUrl: null,
    /** True when URLs go through /api/storage/object (the container stays private). */
    proxied: true,
    /** All company blobs live under `{companyId}/…` for easy offboarding. */
    layout: "company-first" as const,
    /** Reads try this store when Azure does not have the key yet. */
    fallback: azureOn && b2On ? ("backblaze" as const) : null,
  };
}

export function storageFailureMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (isB2Configured() && /is not valid/i.test(message)) return b2FailureMessage(error, fallback);
  return message;
}

let cachedContainer: ContainerClient | null = null;
let cachedContainerKey = "";

async function getContainerClient() {
  const cfg = azureConfig();
  if (!cfg.configured) {
    throw new Error(STORAGE_NOT_CONFIGURED);
  }
  const cacheKey = `${cfg.account}:${cfg.container}:${cfg.connectionString ? "cs" : cfg.accountKey ? "key" : "mi"}`;
  if (cachedContainer && cachedContainerKey === cacheKey) return cachedContainer;

  let service: BlobServiceClient;
  if (cfg.connectionString) {
    service = BlobServiceClient.fromConnectionString(cfg.connectionString);
  } else if (cfg.accountKey) {
    const { StorageSharedKeyCredential } = await import("@azure/storage-blob");
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

  cachedContainer = service.getContainerClient(cfg.container);
  cachedContainerKey = cacheKey;
  return cachedContainer;
}

function bytesBody(bytes: Uint8Array): StoredObject["body"] {
  return { transformToByteArray: async () => bytes };
}

async function downloadAzure(key: string): Promise<StoredObject> {
  const container = await getContainerClient();
  const blob = container.getBlobClient(key);
  const download = await blob.download();
  const stream = download.readableStreamBody;
  const bytes = stream ? await readableToBytes(stream) : new Uint8Array();
  return {
    key,
    body: bytesBody(bytes),
    contentType: download.contentType || "application/octet-stream",
    contentLength: download.contentLength ?? bytes.byteLength,
    cacheControl: download.cacheControl,
  };
}

const KNOWN_BLOB_WRAPPERS = ["TheCRM", "thecrm"];
let cachedWrapperPrefixes: string[] | null = null;
let pinnedWrapperPrefix = "";

async function downloadFirstExisting(keys: string[]): Promise<StoredObject> {
  let lastError: unknown = new Error("The specified blob does not exist.");
  for (const key of keys) {
    try {
      return await downloadAzure(key);
    } catch (error) {
      if (!isMissingStorageError(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

function rememberWrapper(foundKey: string, plainKeys: string[]) {
  if (plainKeys.includes(foundKey)) return;
  const segment = foundKey.split("/")[0] || "";
  if (!isBlobWrapperPrefix(segment) || pinnedWrapperPrefix === segment) return;
  pinnedWrapperPrefix = segment;
  console.info(`[storage] reading blobs under ${segment}/`);
}

async function blobWrapperPrefixes() {
  if (cachedWrapperPrefixes) return cachedWrapperPrefixes;
  const found = new Set<string>(KNOWN_BLOB_WRAPPERS);
  try {
    const container = await getContainerClient();
    let scanned = 0;
    for await (const item of container.listBlobsByHierarchy("/")) {
      scanned += 1;
      if (item.kind === "prefix" && item.name && isBlobWrapperPrefix(item.name)) {
        found.add(item.name.replace(/\/+$/, ""));
      }
      if (scanned > 500) break;
    }
  } catch (error) {
    console.error("[storage] list blob prefixes", error);
  }
  cachedWrapperPrefixes = [...found];
  return cachedWrapperPrefixes;
}

async function downloadAzureWithLegacy(path: string): Promise<StoredObject> {
  const keys = storageReadKeys(path);
  const pinned = pinnedWrapperPrefix ? prefixedStorageKeys([pinnedWrapperPrefix], keys) : [];
  try {
    const object = await downloadFirstExisting([...pinned, ...keys]);
    rememberWrapper(object.key, keys);
    return object;
  } catch (error) {
    if (!isMissingStorageError(error) || pinnedWrapperPrefix) throw error;
  }

  const prefixed = prefixedStorageKeys(await blobWrapperPrefixes(), keys);
  const object = await downloadFirstExisting(prefixed);
  rememberWrapper(object.key, keys);
  return object;
}

export async function getStoredObject(path: string): Promise<StoredObject> {
  const key = path.replace(/^\/+/, "");
  if (isAzureConfigured()) {
    try {
      return await downloadAzureWithLegacy(key);
    } catch (error) {
      if (!isMissingStorageError(error) || !isB2Configured()) throw error;
    }
  }
  if (isB2Configured()) return await getObjectFromB2WithLegacy(key);
  throw new Error(STORAGE_NOT_CONFIGURED);
}

export async function uploadObject(input: {
  companyId: string;
  kind: StorageKind;
  path: string;
  body: Buffer | Uint8Array;
  contentType: string;
}) {
  if (!isAzureConfigured()) {
    if (isB2Configured()) return uploadToB2(input);
    throw new Error(STORAGE_NOT_CONFIGURED);
  }

  const container = await getContainerClient();
  const { container: containerName } = azureConfig();
  const key = storageObjectKey(input.companyId, input.kind, input.path);
  const body =
    input.body instanceof Buffer
      ? new Uint8Array(input.body.buffer, input.body.byteOffset, input.body.byteLength)
      : input.body;

  await container.getBlockBlobClient(key).uploadData(body, {
    blobHTTPHeaders: {
      blobContentType: input.contentType || "application/octet-stream",
    },
  });

  return {
    ok: true as const,
    kind: input.kind,
    bucket: `azure:${containerName}`,
    storagePath: key,
    url: publicObjectUrl(key),
  };
}

export async function copyStoredObject(input: {
  fromPath: string;
  companyId: string;
  kind: StorageKind;
  path: string;
  contentType?: string;
}) {
  const source = await getStoredObject(input.fromPath);
  if (!source.body) {
    throw new Error("Source file not found.");
  }
  const bytes = await source.body.transformToByteArray();
  return uploadObject({
    companyId: input.companyId,
    kind: input.kind,
    path: input.path,
    body: Buffer.from(bytes),
    contentType: input.contentType || source.contentType,
  });
}

export async function removeStoredObject(input: { path: string }) {
  if (!input.path.trim()) return { ok: true as const };
  if (!isStorageConfigured()) throw new Error(STORAGE_NOT_CONFIGURED);

  const cfg = azureConfig();
  const key = objectKeyFromStoredPath(input.path, {
    azureContainer: cfg.container,
    b2Bucket: b2Config().bucket,
  });

  if (isAzureConfigured()) {
    const container = await getContainerClient();
    try {
      await container.deleteBlob(key);
    } catch (error) {
      if (!isMissingStorageError(error)) throw error;
    }
  }
  if (isB2Configured()) {
    await removeFromB2(key);
  }
  return { ok: true as const };
}

async function deleteAzureBatch(container: ContainerClient, keys: string[]) {
  let deleted = 0;
  for (let i = 0; i < keys.length; i += 256) {
    const chunk = keys.slice(i, i + 256);
    if (!chunk.length) continue;
    const result = await container.getBlobBatchClient().deleteBlobs(
      chunk.map((name) => container.getBlobClient(name)),
    );
    const failed = result.subResponses.filter((item) => item.status >= 400 && item.status !== 404);
    deleted += chunk.length - failed.length;
    if (failed.length) {
      const first = failed[0];
      throw new Error(first?.statusMessage || first?.errorCode || "Failed to delete some blobs.");
    }
  }
  return deleted;
}

export async function purgeCompanyObjects(companyId: string) {
  if (!isCompanyId(companyId)) {
    throw new Error("Company id is not a UUID.");
  }
  if (!isStorageConfigured()) throw new Error(STORAGE_NOT_CONFIGURED);

  const prefixes = [
    companyStoragePrefix(companyId),
    ...STORAGE_KINDS.map((kind) => `${kind}/${companyId}/`),
  ];

  let deleted = 0;
  if (isAzureConfigured()) {
    const container = await getContainerClient();
    for (const prefix of prefixes) {
      const keys: string[] = [];
      for await (const blob of container.listBlobsFlat({ prefix })) {
        if (blob.name) keys.push(blob.name);
      }
      deleted += await deleteAzureBatch(container, keys);
    }
  }
  if (isB2Configured()) {
    const purged = await purgeCompanyFromB2(companyId);
    deleted += purged.deleted;
  }

  return { ok: true as const, deleted, prefix: companyStoragePrefix(companyId) };
}
