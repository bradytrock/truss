import { isStorageKind, type StorageKind } from "@/lib/storage/kinds";
import { isAllowedObjectKey, isCompanyId } from "@/lib/storage/urls";

export { isAllowedObjectKey, isCompanyId };

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

/**
 * Drop a stored `azure:{container}/` or `b2:{bucket}/` locator if one was
 * pasted in front of the object key. The key itself is unchanged.
 */
export function objectKeyFromStoredPath(
  path: string,
  locators?: { azureContainer?: string; b2Bucket?: string },
) {
  let key = path.replace(/^\/+/, "");
  const container = locators?.azureContainer?.trim() || "";
  const bucket = locators?.b2Bucket?.trim() || "";
  if (container && key.startsWith(`azure:${container}/`)) {
    key = key.slice(`azure:${container}/`.length);
  }
  if (bucket && key.startsWith(`b2:${bucket}/`)) {
    key = key.slice(`b2:${bucket}/`.length);
  }
  return key;
}
