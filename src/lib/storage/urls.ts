import { STORAGE_KINDS, type StorageKind } from "@/lib/storage/kinds";

export { STORAGE_KINDS, type StorageKind, isStorageKind } from "@/lib/storage/kinds";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCompanyId(value: string) {
  return UUID_RE.test(value.trim());
}

export function isStorageKindValue(value: string): value is StorageKind {
  return (STORAGE_KINDS as readonly string[]).includes(value);
}

/** True when the key is under a known company layout (canonical or legacy). */
export function isAllowedObjectKey(path: string) {
  const clean = path.replace(/^\/+/, "");
  if (!clean || clean.includes("..")) return false;
  const parts = clean.split("/");
  if (parts.length < 3) return false;
  if (isCompanyId(parts[0]) && isStorageKindValue(parts[1])) return true;
  if (isStorageKindValue(parts[0]) && isCompanyId(parts[1])) return true;
  return false;
}

const COMPANY_ASSET_FOLDERS = new Set(["seat-photo", "logo", "card-logo"]);

/**
 * Repair keys that lost the kind segment: `{companyId}/{uuid}/file.pdf`
 * → `{companyId}/job-files/{uuid}/file.pdf` (or the provided kind).
 * Also repairs company assets saved as `{companyId}/seat-photo|logo|card-logo/…`
 * without the `company-assets` segment.
 */
export function normalizeObjectKey(path: string, fallbackKind: StorageKind = "job-files") {
  const clean = path.replace(/^\/+/, "");
  if (!clean || clean.includes("..")) return "";
  if (isAllowedObjectKey(clean)) return clean;
  const parts = clean.split("/");
  if (parts.length >= 3 && isCompanyId(parts[0]) && isCompanyId(parts[1])) {
    return [parts[0], fallbackKind, ...parts.slice(1)].join("/");
  }
  if (
    parts.length >= 3 &&
    isCompanyId(parts[0]) &&
    COMPANY_ASSET_FOLDERS.has(parts[1]) &&
    !isStorageKindValue(parts[1])
  ) {
    return [parts[0], "company-assets", ...parts.slice(1)].join("/");
  }
  return clean;
}

/** Relative app proxy path for a B2 object key. */
export function storageProxyPath(key: string) {
  const objectKey = key.replace(/^\/+/, "");
  return `/api/storage/object?path=${encodeURIComponent(objectKey)}`;
}

/**
 * Durable browser URL for a stored object.
 * Always use the app proxy. The Azure container (and the old B2 bucket) are
 * private, so a raw blob or Backblaze URL 401s in the browser.
 */
export function publicObjectUrl(key: string, _publicBaseUrl?: string) {
  const objectKey = normalizeObjectKey(key) || key.replace(/^\/+/, "");
  return storageProxyPath(objectKey);
}

/**
 * Pull the object key out of a stored proxy URL, a Backblaze friendly URL
 * (`https://f005.backblazeb2.com/file/TheCRM/{key}`), or an Azure blob URL
 * (`https://{account}.blob.core.windows.net/{container}/{key}`).
 */
export function objectKeyFromStoredUrl(url: string) {
  const raw = url.trim();
  if (!raw) return "";
  try {
    const parsed =
      raw.startsWith("http://") || raw.startsWith("https://")
        ? new URL(raw)
        : new URL(raw, "http://local.invalid");
    if (parsed.pathname === "/api/storage/object" || parsed.pathname.endsWith("/api/storage/object")) {
      return decodeURIComponent(parsed.searchParams.get("path") || "").replace(/^\/+/, "");
    }
    // Backblaze friendly download URL: /file/{bucket}/{objectKey}
    const friendly = parsed.pathname.match(/^\/file\/[^/]+\/(.+)$/);
    if (friendly?.[1]) {
      return decodeURIComponent(friendly[1]).replace(/^\/+/, "");
    }
    // S3-style path endpoint: /{bucket}/{objectKey} on *.backblazeb2.com
    if (/\.backblazeb2\.com$/i.test(parsed.hostname)) {
      const parts = parsed.pathname.replace(/^\/+/, "").split("/");
      if (parts.length >= 2) {
        return parts.slice(1).join("/");
      }
    }
    // Azure Blob: /{container}/{objectKey}
    if (/\.blob\.core\.windows\.net$/i.test(parsed.hostname)) {
      const parts = parsed.pathname.replace(/^\/+/, "").split("/");
      if (parts.length >= 2) {
        return decodeURIComponent(parts.slice(1).join("/")).replace(/^\/+/, "");
      }
    }
  } catch {
    // ignore
  }
  return "";
}

/**
 * Older uploads dropped the kind segment: `{companyId}/{uploadId}/file.jpg`.
 * Inverse of that repair — used when the canonical key 404s.
 */
export function legacyKindlessObjectKey(path: string) {
  const clean = path.replace(/^\/+/, "");
  const parts = clean.split("/");
  if (
    parts.length >= 4 &&
    isCompanyId(parts[0]) &&
    isStorageKindValue(parts[1]) &&
    isCompanyId(parts[2])
  ) {
    return [parts[0], ...parts.slice(2)].join("/");
  }
  return "";
}

/** `{companyId}/{kind}/…` ↔ `{kind}/{companyId}/…` */
export function swapCompanyAndKind(path: string) {
  const parts = path.replace(/^\/+/, "").split("/");
  if (parts.length < 3) return "";
  const [first, second, ...rest] = parts;
  if (!first || !second) return "";
  if (isCompanyId(first) && isStorageKindValue(second)) {
    return [second, first, ...rest].join("/");
  }
  if (isStorageKindValue(first) && isCompanyId(second)) {
    return [second, first, ...rest].join("/");
  }
  return "";
}

/**
 * Blob names to try for one stored file.
 * Canonical company-first, the older kindless key, and the kind-first key.
 */
export function storageReadKeys(path: string) {
  const keys: string[] = [];
  const add = (candidate: string) => {
    const value = candidate.replace(/^\/+/, "");
    if (!value || value.includes("..") || keys.includes(value)) return;
    keys.push(value);
  };
  const clean = path.replace(/^\/+/, "");
  add(clean);
  add(legacyKindlessObjectKey(clean));
  const swapped = swapCompanyAndKind(clean);
  add(swapped);
  if (swapped) add(legacyKindlessObjectKey(swapped));
  return keys;
}

/** A folder sitting in front of every company id, such as the old bucket name. */
export function isBlobWrapperPrefix(prefix: string) {
  const segment = prefix.replace(/^\/+|\/+$/g, "").split("/")[0] || "";
  if (!segment || segment.startsWith("$") || segment.includes("..")) return false;
  if (isCompanyId(segment) || isStorageKindValue(segment)) return false;
  return true;
}

export function prefixedStorageKeys(prefixes: string[], keys: string[]) {
  const out: string[] = [];
  for (const prefix of prefixes) {
    const segment = prefix.replace(/^\/+|\/+$/g, "");
    if (!isBlobWrapperPrefix(segment)) continue;
    for (const key of keys) {
      const candidate = `${segment}/${key}`;
      if (!out.includes(candidate)) out.push(candidate);
    }
  }
  return out;
}

function pushAllowedKey(keys: string[], key: string) {
  const clean = key.replace(/^\/+/, "");
  if (!clean || !isAllowedObjectKey(clean) || keys.includes(clean)) return;
  keys.push(clean);
}

/**
 * Object keys to try for a stored file, most reliable first.
 * Prefer a key that is already well-formed (from the Backblaze URL or a
 * canonical storage_path) over a repaired guess.
 */
export function storedObjectKeyCandidates(input: {
  storagePath?: string | null;
  url?: string | null;
  kind?: StorageKind;
}) {
  const kind = input.kind ?? "job-files";
  const rawPath = (input.storagePath || "").replace(/^\/+/, "");
  const rawUrlKey = objectKeyFromStoredUrl(input.url || "");
  const keys: string[] = [];
  if (rawPath && isAllowedObjectKey(rawPath)) pushAllowedKey(keys, rawPath);
  if (rawUrlKey && isAllowedObjectKey(rawUrlKey)) pushAllowedKey(keys, rawUrlKey);
  pushAllowedKey(keys, normalizeObjectKey(rawUrlKey, kind));
  pushAllowedKey(keys, normalizeObjectKey(rawPath, kind));
  return keys;
}

/**
 * Prefer a relative proxy URL from storage_path so stale localhost/preview
 * origins and private Backblaze friendly URLs in row.url do not break opens.
 */
export function resolveStoredFileUrl(input: {
  storagePath?: string | null;
  url?: string | null;
  publicBaseUrl?: string;
  kind?: StorageKind;
}) {
  const key = storedObjectKeyCandidates(input)[0];
  if (key) return publicObjectUrl(key, input.publicBaseUrl);
  // Never hand the browser a private blob URL — it 401s outside the app proxy.
  const raw = (input.url || "").trim();
  if (/backblazeb2\.com/i.test(raw) || /\.blob\.core\.windows\.net/i.test(raw)) return "";
  return raw;
}
