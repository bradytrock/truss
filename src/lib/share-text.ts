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

export function defaultShareEmailSubject(input: {
  kind: ShareDocumentKind;
  company: string;
  number: string;
  name: string;
}) {
  const company = input.company.trim() || "Office";
  if (input.kind === "invoice") {
    return `${company}: invoice ${input.number}`;
  }
  if (input.kind === "page") {
    const label = input.name.trim() || "document";
    return `${company}: ${label}`;
  }
  return `${company}: proposal ${input.number}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function defaultShareEmailHtml(input: {
  kind: ShareDocumentKind;
  company: string;
  customer: string;
  number: string;
  name: string;
  url: string;
}) {
  const who = escapeHtml(firstName(input.customer));
  const company = escapeHtml(input.company.trim() || "the contractor");
  const url = escapeHtml(input.url);
  const cta =
    input.kind === "estimate" ? "Review and sign" : input.kind === "invoice" ? "View invoice" : "Open document";
  const lead =
    input.kind === "invoice"
      ? `${company} sent invoice ${escapeHtml(input.number)}${input.name.trim() ? ` (${escapeHtml(input.name.trim())})` : ""}.`
      : input.kind === "page"
        ? `${company} sent ${escapeHtml(input.name.trim() || "a document")}.`
        : `${company} sent your proposal ${escapeHtml(input.number)}${input.name.trim() ? ` — ${escapeHtml(input.name.trim())}` : ""}.`;
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#eef2f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d7dee8;">
      <tr>
        <td style="padding:28px 28px 8px;font-size:20px;line-height:1.3;font-weight:600;">Hi ${who},</td>
      </tr>
      <tr>
        <td style="padding:8px 28px 20px;font-size:16px;line-height:1.5;">${lead}</td>
      </tr>
      <tr>
        <td style="padding:0 28px 28px;">
          <a href="${url}" style="display:inline-block;background:#0f3d4c;color:#ffffff;text-decoration:none;padding:12px 18px;font-size:15px;border-radius:4px;">${cta}</a>
          <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#475569;word-break:break-all;">Or open this link:<br/><a href="${url}" style="color:#0f3d4c;">${url}</a></p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function defaultShareEmailText(input: {
  kind: ShareDocumentKind;
  company: string;
  customer: string;
  number: string;
  name: string;
  url: string;
}) {
  return defaultShareText(input);
}

export function looksLikeEmail(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
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
