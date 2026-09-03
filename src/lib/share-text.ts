import { firstName } from "@/lib/phone";

export type ShareDocumentKind = "estimate" | "invoice" | "page";

export type ShareEmailOwner = {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  /** Plain-text sign-off (seat signature or company default). */
  signature?: string;
};

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

/** Make logo/asset URLs absolute so email clients can load them. */
export function absoluteShareAssetUrl(url: string, origin = "") {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) return trimmed;
  const base = origin.trim() || (typeof window !== "undefined" ? window.location.origin : "");
  if (!base) return trimmed;
  try {
    return new URL(trimmed, base.endsWith("/") ? base : `${base}/`).href;
  } catch {
    return trimmed;
  }
}

function documentLead(input: {
  kind: ShareDocumentKind;
  company: string;
  number: string;
  name: string;
}) {
  const company = input.company.trim() || "the contractor";
  if (input.kind === "invoice") {
    const label = input.name.trim() ? ` (${input.name.trim()})` : "";
    return `${company} sent invoice ${input.number}${label}.`;
  }
  if (input.kind === "page") {
    return `${company} sent ${input.name.trim() || "a document"}.`;
  }
  const job = input.name.trim() ? ` — ${input.name.trim()}` : "";
  return `${company} sent your proposal ${input.number}${job}.`;
}

function ctaLabel(kind: ShareDocumentKind) {
  if (kind === "estimate") return "Review and sign";
  if (kind === "invoice") return "View invoice";
  return "Open document";
}

function supportingLine(kind: ShareDocumentKind) {
  if (kind === "estimate") {
    return "Open the link below to review the proposal and sign from your phone — no login needed.";
  }
  if (kind === "invoice") {
    return "Open the link below to view the invoice and download a PDF — no login needed.";
  }
  return "Open the link below to view the document — no login needed.";
}

function ownerContactLines(owner?: ShareEmailOwner | null) {
  if (!owner?.name.trim()) return [] as string[];
  const lines = [owner.name.trim()];
  if (owner.title?.trim()) lines.push(owner.title.trim());
  if (owner.phone?.trim()) lines.push(owner.phone.trim());
  if (owner.email?.trim()) lines.push(owner.email.trim());
  return lines;
}

function signOffBlock(owner?: ShareEmailOwner | null) {
  const signature = owner?.signature?.trim() ?? "";
  if (signature) return signature;
  if (!owner?.name?.trim()) return "";
  return "Thanks,";
}

export function defaultShareEmailHtml(input: {
  kind: ShareDocumentKind;
  company: string;
  customer: string;
  number: string;
  name: string;
  url: string;
  logoUrl?: string;
  owner?: ShareEmailOwner | null;
  origin?: string;
}) {
  const who = escapeHtml(firstName(input.customer));
  const company = escapeHtml(input.company.trim() || "the contractor");
  const url = escapeHtml(input.url);
  const cta = ctaLabel(input.kind);
  const lead = escapeHtml(documentLead(input));
  const support = escapeHtml(supportingLine(input.kind));
  const logo = absoluteShareAssetUrl(input.logoUrl || "", input.origin);
  const logoSrc = escapeHtml(logo);
  const signOff = signOffBlock(input.owner);

  const logoRow = logo
    ? `<tr>
        <td style="padding:28px 32px 8px;text-align:left;">
          <img src="${logoSrc}" alt="${company}" width="220" style="display:block;max-width:220px;width:100%;height:auto;border:0;outline:none;text-decoration:none;" />
        </td>
      </tr>`
    : `<tr>
        <td style="padding:28px 32px 8px;font-size:18px;line-height:1.3;font-weight:700;letter-spacing:0.02em;color:#0f3d4c;">${company}</td>
      </tr>`;

  const signOffHtml = signOff
    ? `<tr>
        <td style="padding:8px 32px 4px;font-size:15px;line-height:1.6;color:#0f172a;white-space:pre-line;">${escapeHtml(signOff)}</td>
      </tr>`
    : "";

  const ownerName = input.owner?.name?.trim() ?? "";
  const ownerTitle = input.owner?.title?.trim() ?? "";
  const ownerPhone = input.owner?.phone?.trim() ?? "";
  const ownerEmail = input.owner?.email?.trim() ?? "";
  const contactHtml =
    ownerName
      ? `<tr>
        <td style="padding:16px 32px 28px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e2e8f0;">
            <tr>
              <td style="padding-top:16px;font-size:12px;line-height:1.2;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;font-weight:600;">Your project manager</td>
            </tr>
            <tr>
              <td style="padding-top:10px;font-size:15px;line-height:1.55;color:#0f172a;">
                <strong style="font-size:16px;">${escapeHtml(ownerName)}</strong>${
                  ownerTitle
                    ? `<br/><span style="color:#475569;">${escapeHtml(ownerTitle)}</span>`
                    : ""
                }${
                  ownerPhone
                    ? `<br/><a href="tel:${escapeHtml(ownerPhone.replace(/[^\d+]/g, ""))}" style="color:#0f3d4c;text-decoration:none;">${escapeHtml(ownerPhone)}</a>`
                    : ""
                }${
                  ownerEmail
                    ? `<br/><a href="mailto:${escapeHtml(ownerEmail)}" style="color:#0f3d4c;text-decoration:none;">${escapeHtml(ownerEmail)}</a>`
                    : ""
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>`
      : `<tr><td style="padding-bottom:28px;"></td></tr>`;

  return `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(cta)}</title>
  </head>
  <body style="margin:0;padding:0;background:#e8eef3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e8eef3;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d5dee8;">
            ${logoRow}
            <tr>
              <td style="padding:20px 32px 6px;font-size:22px;line-height:1.3;font-weight:600;color:#0f172a;">Hi ${who},</td>
            </tr>
            <tr>
              <td style="padding:6px 32px 10px;font-size:16px;line-height:1.55;color:#334155;">${lead}</td>
            </tr>
            <tr>
              <td style="padding:0 32px 22px;font-size:15px;line-height:1.55;color:#64748b;">${support}</td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px;">
                <a href="${url}" style="display:inline-block;background:#0f3d4c;color:#ffffff;text-decoration:none;padding:13px 20px;font-size:15px;font-weight:600;border-radius:4px;">${escapeHtml(cta)}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all;">
                Or paste this link into your browser:<br/>
                <a href="${url}" style="color:#0f3d4c;">${url}</a>
              </td>
            </tr>
            ${signOffHtml}
            ${contactHtml}
          </table>
          <p style="margin:16px 0 0;font-size:11px;line-height:1.4;color:#94a3b8;max-width:560px;">Sent by ${company}</p>
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
  owner?: ShareEmailOwner | null;
}) {
  const who = firstName(input.customer);
  const lead = documentLead(input);
  const support = supportingLine(input.kind);
  const parts = [`Hi ${who},`, "", lead, support, "", ctaLabel(input.kind) + ":", input.url];
  const signOff = signOffBlock(input.owner);
  if (signOff) {
    parts.push("", signOff);
  }
  const contact = ownerContactLines(input.owner);
  if (contact.length) {
    parts.push("", "Your project manager", ...contact);
  }
  return parts.join("\n");
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
