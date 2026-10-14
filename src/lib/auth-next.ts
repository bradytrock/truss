type HeaderSource = { get(name: string): string | null };

function firstHeader(headers: HeaderSource, name: string) {
  return headers.get(name)?.split(",")[0]?.trim() ?? "";
}

/** Public origin from the request, so a redirect stays on the host the browser used. */
export function originFromHeaders(headers: HeaderSource, fallback: string) {
  const host = firstHeader(headers, "x-forwarded-host") || firstHeader(headers, "host");
  if (!host) return fallback;
  const forwarded = firstHeader(headers, "x-forwarded-proto");
  const local = host.startsWith("localhost") || host.startsWith("127.") || host.startsWith("[::1]");
  const proto = forwarded || (local ? "http" : "https");
  return `${proto}://${host}`;
}

/** Relative in-app path. Rejects protocol-relative and absolute URLs. */
export function safeNextPath(value: string | null | undefined) {
  const path = (value ?? "").trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return "/";
  if (path.includes("://") || path.includes("\\")) return "/";
  return path;
}

/** First sign-in keeps the requested path and opens the welcome screen. */
export function destinationAfterSignIn(nextPath: string, welcomePending: boolean) {
  const dest = safeNextPath(nextPath);
  if (!welcomePending) return dest;
  const url = new URL(dest, "https://truss.local");
  url.searchParams.set("welcome", "1");
  return `${url.pathname}${url.search}`;
}
