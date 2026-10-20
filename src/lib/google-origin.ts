function localHostName(host: string) {
  const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return name === "localhost" || name === "127.0.0.1" || name === "::1" || name === "0.0.0.0";
}

/**
 * Origin Google should redirect back to. `next dev --hostname 0.0.0.0` reports
 * that bind address on `request.url`, and a TLS proxy often reports `http`.
 * Google rejects a public `http` callback and any callback that is not the
 * registered localhost or https host.
 */
export function googleRequestOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
  const hostHeader = request.headers.get("host")?.split(",")[0]?.trim() ?? "";
  let host = forwardedHost || hostHeader;
  if (!host) {
    try {
      host = new URL(request.url).host;
    } catch {
      host = "localhost:3847";
    }
  }
  if (host.startsWith("0.0.0.0")) host = `localhost${host.slice("0.0.0.0".length)}`;
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwarded || (localHostName(host) ? "http" : "https");
  return `${proto}://${host}`;
}
