export function isPublicCardPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length === 3 && parts[1] === "card";
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
