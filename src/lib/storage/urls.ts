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
 * Always use the app proxy — the B2 bucket is private, so friendly
 * `f005.backblazeb2.com/file/...` URLs 401 in the browser as raw JSON.
 * (Leave B2_PUBLIC_BASE_URL unset until the bucket is actually public.)
 */
export function publicObjectUrl(key: string, _publicBaseUrl?: string) {
  const objectKey = normalizeObjectKey(key) || key.replace(/^\/+/, "");
  return storageProxyPath(objectKey);
}

/**
 * Pull the object key out of a stored proxy URL or a Backblaze friendly URL
 * (`https://f005.backblazeb2.com/file/TheCRM/{key}`).
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
  } catch {
    // ignore
  }
  return "";
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
  const kind = input.kind ?? "job-files";
  const fromPath = normalizeObjectKey((input.storagePath || "").replace(/^\/+/, ""), kind);
  if (fromPath && isAllowedObjectKey(fromPath)) {
    return publicObjectUrl(fromPath, input.publicBaseUrl);
  }
  const fromUrl = normalizeObjectKey(objectKeyFromStoredUrl(input.url || ""), kind);
  if (fromUrl && isAllowedObjectKey(fromUrl)) {
    return publicObjectUrl(fromUrl, input.publicBaseUrl);
  }
  // Never hand the browser a private B2 friendly URL — it 401s as raw JSON.
  const raw = (input.url || "").trim();
  if (/backblazeb2\.com/i.test(raw)) return "";
  return raw;
}
