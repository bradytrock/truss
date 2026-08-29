export type RequestAudit = {
  ipAddress: string;
  forwardedFor: string;
  userAgent: string;
  acceptLanguage: string;
};

function headerValue(headers: Headers, name: string) {
  return headers.get(name)?.trim() ?? "";
}

/** Client IP as the host saw it. Prefer CDN / proxy headers; keep the full forwarded chain. */
export function requestAudit(headers: Headers): RequestAudit {
  const forwardedFor = headerValue(headers, "x-forwarded-for");
  const chain = forwardedFor
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const ipAddress =
    headerValue(headers, "cf-connecting-ip") ||
    headerValue(headers, "x-real-ip") ||
    chain[0] ||
    headerValue(headers, "x-client-ip") ||
    "";
  return {
    ipAddress: ipAddress.slice(0, 80),
    forwardedFor: (forwardedFor || chain.join(", ")).slice(0, 400),
    userAgent: headerValue(headers, "user-agent").slice(0, 500),
    acceptLanguage: headerValue(headers, "accept-language").slice(0, 200),
  };
}
