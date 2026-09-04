/** Append a document share token to private storage proxy URLs so share pages can load photos. */
export function withStorageShareAccess(url: string, shareToken: string) {
  const token = shareToken.trim();
  const raw = url.trim();
  if (!token || !raw) return raw;
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  try {
    const absolute = raw.startsWith("http://") || raw.startsWith("https://");
    const parsed = absolute ? new URL(raw) : new URL(raw, "http://local.invalid");
    const isProxy =
      parsed.pathname === "/api/storage/object" || parsed.pathname.endsWith("/api/storage/object");
    if (!isProxy) return raw;
    parsed.searchParams.set("share", token);
    if (absolute) return parsed.toString();
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return raw;
  }
}

export function withStorageShareAccessDeep(value: unknown, shareToken: string): unknown {
  const token = shareToken.trim();
  if (!token) return value;
  if (typeof value === "string") return withStorageShareAccess(value, token);
  if (Array.isArray(value)) {
    return value.map((item) => withStorageShareAccessDeep(item, token));
  }
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (
        key === "imageUrl" ||
        key === "url" ||
        key === "logoUrl" ||
        key === "cardLogoUrl" ||
        key === "photoUrl" ||
        key === "receiptUrl"
      ) {
        next[key] = typeof item === "string" ? withStorageShareAccess(item, token) : item;
      } else {
        next[key] = withStorageShareAccessDeep(item, token);
      }
    }
    return next;
  }
  return value;
}
