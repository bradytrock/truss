import { firstName } from "@/lib/phone";

export type ShareDocumentKind = "estimate" | "invoice" | "page";

export function defaultShareText(input: {
  kind: ShareDocumentKind;
  company: string;
  customer: string;
  number: string;
  name: string;
  url: string;
}) {
  const who = firstName(input.customer);
  const company = input.company.trim() || "the contractor";
  if (input.kind === "invoice") {
    const label = input.name.trim() ? ` (${input.name.trim()})` : "";
    return `Hi ${who}, ${company} sent invoice ${input.number}${label}. Open it here:\n${input.url}`;
  }
  if (input.kind === "page") {
    const label = input.name.trim() || "document";
    return `Hi ${who}, ${company} sent ${label}. Open it here:\n${input.url}`;
  }
  const job = input.name.trim() ? ` — ${input.name.trim()}` : "";
  return `Hi ${who}, ${company} sent your proposal ${input.number}${job}. Review and sign here:\n${input.url}`;
}

export function shareUrlAllowed(url: string, origin: string) {
  try {
    const parsed = new URL(url);
    const allowed = new Set<string>();
    try {
      allowed.add(new URL(origin).origin);
    } catch {
      /* ignore */
    }
    const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (configured) {
      try {
        allowed.add(new URL(configured).origin);
      } catch {
        /* ignore */
      }
    }
    if (!allowed.has(parsed.origin)) return false;
    return /^\/share\/[eip]\/[A-Za-z0-9_-]+\/?$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  return `${proto}://${host}`;
}
