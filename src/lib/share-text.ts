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
  /** Job / property address, e.g. "123 Main St, Denver, CO 80205". */
  propertyAddress?: string;
}) {
  const company = input.company.trim() || "Office";
  const address = input.propertyAddress?.trim() || "";
  if (input.kind === "estimate") {
    return address
      ? `Your Proposal from ${company} for ${address}`
      : `Your Proposal from ${company}`;
  }
  if (input.kind === "invoice") {
    return address
      ? `Your Invoice from ${company} for ${address}`
      : input.number.trim()
        ? `Your Invoice from ${company} (${input.number.trim()})`
        : `Your Invoice from ${company}`;
  }
  const label = input.name.trim() || "document";
  return address
    ? `${label} from ${company} for ${address}`
    : `${label} from ${company}`;
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

function documentEyebrow(input: {
  kind: ShareDocumentKind;
  number: string;
  name: string;
}) {
  if (input.kind === "invoice") {
    return input.number.trim() ? `Invoice ${input.number.trim()}` : "Invoice";
  }
  if (input.kind === "page") {
    return input.name.trim() || "Document";
  }
  return input.number.trim() ? `Proposal ${input.number.trim()}` : "Proposal";
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
    return "Review the scope, pick your package if needed, and sign from your phone — no account required.";
  }
  if (kind === "invoice") {
    return "Open the invoice on any device and download a PDF when you need it — no account required.";
  }
  return "Open the document on any device — no account required.";
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
  const eyebrow = escapeHtml(documentEyebrow(input));
  const lead = escapeHtml(documentLead(input));
  const support = escapeHtml(supportingLine(input.kind));
  const logo = absoluteShareAssetUrl(input.logoUrl || "", input.origin);
  const logoSrc = escapeHtml(logo);
  const signOff = signOffBlock(input.owner);
  const jobLabel = escapeHtml(input.name.trim());

  const logoBlock = logo
    ? `<img src="${logoSrc}" alt="${company}" width="200" style="display:block;max-width:200px;width:100%;height:auto;border:0;outline:none;text-decoration:none;" />`
    : `<span style="display:inline-block;font-size:20px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:#fafafa;">${company}</span>`;

  const signOffHtml = signOff
    ? `<tr>
        <td style="padding:4px 40px 0;font-size:15px;line-height:1.65;color:#3f3f46;white-space:pre-line;">${escapeHtml(signOff)}</td>
      </tr>`
    : "";

  const ownerName = input.owner?.name?.trim() ?? "";
  const ownerTitle = input.owner?.title?.trim() ?? "";
  const ownerPhone = input.owner?.phone?.trim() ?? "";
  const ownerEmail = input.owner?.email?.trim() ?? "";
  const telHref = ownerPhone.replace(/[^\d+]/g, "");

  const contactHtml = ownerName
    ? `<tr>
        <td style="padding:0;background:#0a0a0a;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="padding:28px 40px 6px;font-size:11px;line-height:1.2;letter-spacing:0.18em;text-transform:uppercase;color:#737373;font-weight:600;">Project manager</td>
            </tr>
            <tr>
              <td style="padding:2px 40px ${ownerTitle ? "4px" : ownerPhone || ownerEmail ? "12px" : "28px"};font-size:22px;line-height:1.2;font-weight:700;letter-spacing:-0.03em;color:#fafafa;">${escapeHtml(ownerName)}</td>
            </tr>
            ${
              ownerTitle
                ? `<tr><td style="padding:0 40px 16px;font-size:14px;line-height:1.4;color:#a3a3a3;">${escapeHtml(ownerTitle)}</td></tr>`
                : ""
            }
            ${
              ownerPhone || ownerEmail
                ? `<tr>
              <td style="padding:0 40px 28px;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    ${
                      ownerPhone
                        ? `<td style="padding:10px 14px;background:#171717;font-size:13px;line-height:1.3;">
                      <a href="tel:${escapeHtml(telHref)}" style="color:#5eead4;text-decoration:none;font-weight:600;">${escapeHtml(ownerPhone)}</a>
                    </td>
                    <td style="width:8px;font-size:0;">&nbsp;</td>`
                        : ""
                    }
                    ${
                      ownerEmail
                        ? `<td style="padding:10px 14px;background:#171717;font-size:13px;line-height:1.3;">
                      <a href="mailto:${escapeHtml(ownerEmail)}" style="color:#e5e5e5;text-decoration:none;">${escapeHtml(ownerEmail)}</a>
                    </td>`
                        : ""
                    }
                  </tr>
                </table>
              </td>
            </tr>`
                : ""
            }
          </table>
        </td>
      </tr>`
    : "";

  return `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(cta)}</title>
  </head>
  <body style="margin:0;padding:0;background:#e5e5e5;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a0a0a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e5e5e5;background-image:radial-gradient(ellipse at top left,#ccfbf1 0%,transparent 42%),radial-gradient(ellipse at bottom right,#e5e5e5 0%,#d4d4d4 100%);padding:36px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-collapse:collapse;">
            <tr>
              <td style="padding:0;background:#0a0a0a;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding:32px 40px 28px;">
                      <table role="presentation" cellspacing="0" cellpadding="0" style="background:#ffffff;">
                        <tr>
                          <td style="padding:16px 20px;">${logoBlock}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="height:3px;line-height:3px;font-size:0;background:#14b8a6;">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:40px 40px 0;">
                <p style="margin:0 0 18px;font-size:12px;line-height:1.2;letter-spacing:0.2em;text-transform:uppercase;color:#0f766e;font-weight:700;">${eyebrow}</p>
                <h1 style="margin:0;font-size:36px;line-height:1.08;font-weight:800;letter-spacing:-0.04em;color:#0a0a0a;">Hi ${who}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 40px 0;font-size:17px;line-height:1.55;color:#404040;">${lead}</td>
            </tr>
            ${
              jobLabel && input.kind !== "page"
                ? `<tr><td style="padding:20px 40px 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fafafa;border-collapse:collapse;">
                <tr>
                  <td style="width:4px;background:#14b8a6;font-size:0;line-height:0;">&nbsp;</td>
                  <td style="padding:14px 18px;font-size:15px;line-height:1.4;color:#262626;font-weight:600;">
                    <span style="display:block;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#737373;font-weight:600;margin-bottom:6px;">${input.kind === "invoice" ? "Invoice" : "Job"}</span>
                    ${jobLabel}
                  </td>
                </tr>
              </table>
            </td></tr>`
                : ""
            }
            <tr>
              <td style="padding:18px 40px 32px;font-size:15px;line-height:1.6;color:#737373;">${support}</td>
            </tr>
            <tr>
              <td style="padding:0 40px 8px;">
                <a href="${url}" style="display:block;background:#0a0a0a;color:#ffffff;text-decoration:none;padding:18px 24px;font-size:16px;font-weight:700;letter-spacing:-0.01em;text-align:center;">${escapeHtml(cta)}&nbsp;&nbsp;&#8594;</a>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 40px 28px;font-size:12px;line-height:1.5;color:#a3a3a3;text-align:center;">
                Prefer a raw link? <a href="${url}" style="color:#0f766e;text-decoration:underline;">Open securely</a>
              </td>
            </tr>
            ${signOffHtml}
            <tr><td style="height:28px;line-height:28px;font-size:0;">&nbsp;</td></tr>
            ${contactHtml}
          </table>
          <p style="margin:22px 0 0;font-size:11px;line-height:1.5;color:#737373;max-width:600px;text-align:center;">Sent by ${company}</p>
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
  const parts = [
    documentEyebrow(input).toUpperCase(),
    "",
    `Hi ${who},`,
    "",
    lead,
    support,
    "",
    `${ctaLabel(input.kind)}:`,
    input.url,
  ];
  const signOff = signOffBlock(input.owner);
  if (signOff) {
    parts.push("", signOff);
  }
  const contact = ownerContactLines(input.owner);
  if (contact.length) {
    parts.push("", "Project manager", ...contact);
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
