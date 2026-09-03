/** Metadata routes Next.js serves beside a card page, fetched by link-preview crawlers. */
const CARD_METADATA_SEGMENTS = new Set(["opengraph-image", "twitter-image"]);

export function isPublicCardPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[1] !== "card") return false;
  if (parts.length === 3) return true;
  return parts.length === 4 && CARD_METADATA_SEGMENTS.has(parts[3]);
}

export function isPublicAppPath(pathname: string) {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/share") ||
    pathname.startsWith("/api/") ||
    isPublicCardPath(pathname)
  );
}
