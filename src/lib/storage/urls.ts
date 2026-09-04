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

/** Relative app proxy path for a B2 object key. */
export function storageProxyPath(key: string) {
  const objectKey = key.replace(/^\/+/, "");
  return `/api/storage/object?path=${encodeURIComponent(objectKey)}`;
}

/**
 * Durable browser URL for a stored object.
 * Prefer B2_PUBLIC_BASE_URL when the bucket is public; otherwise a relative
 * `/api/storage/object` path so links work on whatever host the user is on
 * (never bake request.origin — cloud previews become localhost:randomPort).
 */
export function publicObjectUrl(key: string, publicBaseUrl?: string) {
  const objectKey = key.replace(/^\/+/, "");
  const base = (publicBaseUrl ?? "").replace(/\/+$/, "");
  if (base) return `${base}/${objectKey}`;
  return storageProxyPath(objectKey);
}

/** Pull the object key out of a stored proxy URL, if present. */
export function objectKeyFromStoredUrl(url: string) {
  const raw = url.trim();
  if (!raw) return "";
  try {
    const parsed = raw.startsWith("http://") || raw.startsWith("https://")
      ? new URL(raw)
      : new URL(raw, "http://local.invalid");
    if (parsed.pathname === "/api/storage/object" || parsed.pathname.endsWith("/api/storage/object")) {
      return decodeURIComponent(parsed.searchParams.get("path") || "").replace(/^\/+/, "");
    }
  } catch {
    // ignore
  }
  return "";
}

/**
 * Prefer a relative proxy URL from storage_path so stale localhost/preview
 * origins in row.url do not break opens.
 */
export function resolveStoredFileUrl(input: {
  storagePath?: string | null;
  url?: string | null;
  publicBaseUrl?: string;
}) {
  const path = (input.storagePath || "").replace(/^\/+/, "");
  if (path && isAllowedObjectKey(path)) {
    return publicObjectUrl(path, input.publicBaseUrl);
  }
  const fromUrl = objectKeyFromStoredUrl(input.url || "");
  if (fromUrl && isAllowedObjectKey(fromUrl)) {
    return publicObjectUrl(fromUrl, input.publicBaseUrl);
  }
  return (input.url || "").trim();
}
