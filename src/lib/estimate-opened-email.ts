import {
  estimateOpenedAddress,
  estimateOpenedLabel,
  estimateOpenedProposalTotal,
  estimateOpenedWho,
  type EstimateOpenedNotify,
} from "./estimate-opened.ts";

/** Same red as the app primary. Companies do not store a separate brand color. */
export const ESTIMATE_OPENED_BRAND_COLOR = "#d71c27";

const TEMPLATE = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light only">
  <title>{{title}}</title>
  <style>
    body { margin:0; padding:0; background:#F3F4F6; }
    a { text-decoration:none; }
    @media only screen and (max-width:620px) {
      .container { width:100% !important; }
      .px { padding-left:22px !important; padding-right:22px !important; }
      .stack { display:block !important; width:100% !important; }
      .stack-gap { padding-top:10px !important; padding-left:0 !important; }
      .btn-table { width:100% !important; }
      .btn { padding-right:0 !important; }
      .btn a { display:block !important; }
      .h1 { font-size:22px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    {{preheader}}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F4F6;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

          <tr>
            <td align="left" class="px" style="padding:0 8px 18px 8px;">
              {{logo_html}}
            </td>
          </tr>

          <tr>
            <td style="background:#FFFFFF;border-radius:14px;border:1px solid #E5E7EB;overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

                <tr><td style="height:5px;line-height:5px;font-size:0;background:{{brand_color}};">&nbsp;</td></tr>

                <tr>
                  <td class="px" style="padding:30px 36px 6px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:700;letter-spacing:.4px;color:#047857;text-transform:uppercase;">
                          &#9679;&nbsp; Proposal opened
                        </td>
                      </tr>
                    </table>
                    <h1 class="h1" style="margin:18px 0 8px 0;font-size:26px;line-height:1.25;font-weight:800;color:#111827;">
                      {{headline}}
                    </h1>
                    <p style="margin:0;font-size:15px;line-height:1.6;color:#4B5563;">
                      {{intro_html}}
                    </p>
                  </td>
                </tr>

                <tr>
                  <td class="px" style="padding:24px 36px 4px 36px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
                      <tr>
                        <td style="padding:18px 20px 14px 20px;border-bottom:1px solid #E5E7EB;">
                          <div style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#6B7280;">Property</div>
                          {{property_name_html}}
                          {{address_city_html}}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:14px 20px 18px 20px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td class="stack" width="33%" valign="top" style="font-size:14px;color:#111827;">
                                <div style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#6B7280;padding-bottom:3px;">Proposal</div>
                                {{estimate_number}}
                              </td>
                              <td class="stack stack-gap" width="33%" valign="top" style="font-size:14px;color:#111827;padding-left:12px;">
                                <div style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#6B7280;padding-bottom:3px;">Job</div>
                                {{job_code}}
                              </td>
                              <td class="stack stack-gap" width="34%" valign="top" style="font-size:14px;color:#111827;padding-left:12px;">
                                <div style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#6B7280;padding-bottom:3px;">Amount</div>
                                {{proposal_amount}}
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td class="px" style="padding:12px 36px 0 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;color:#6B7280;">
                    Times opened: <strong style="color:#374151;">{{open_count}}</strong>
                  </td>
                </tr>

                <tr>
                  <td class="px" style="padding:26px 36px 34px 36px;">
                    <table role="presentation" class="btn-table" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="stack btn" valign="top" style="padding-right:8px;white-space:nowrap;">
                          <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{proposal_url}}" style="height:46px;v-text-anchor:middle;width:220px;" arcsize="18%" stroke="f" fillcolor="{{brand_color}}"><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">{{button}}</center></v:roundrect><![endif]-->
                          <!--[if !mso]><!-->
                          <a href="{{proposal_url}}" style="display:inline-block;background:{{brand_color}};color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:700;line-height:46px;padding:0 26px;border-radius:8px;text-align:center;">{{button}}</a>
                          <!--<![endif]-->
                        </td>
                        {{job_button_html}}
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <tr>
            <td class="px" align="center" style="padding:22px 24px 0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;line-height:1.7;color:#9CA3AF;">
              {{company_name}}{{company_phone_html}}<br>
              {{footer_reason}}
              <a href="{{settings_url}}" style="color:#6B7280;text-decoration:underline;">Manage notifications</a><br>
              <span style="color:#B6BCC6;">Powered by TheRoofingCRM</span>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fill(vars: Record<string, string>) {
  return TEMPLATE.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => vars[key] ?? "");
}

export function estimateOpenedBrandColor(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : ESTIMATE_OPENED_BRAND_COLOR;
}

function safeTimeZone(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  try {
    Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
    return trimmed;
  } catch {
    return "";
  }
}

export function formatEstimateOpenedAt(iso: string | null | undefined, timeZone?: string | null, now = new Date()) {
  const date = iso?.trim() ? new Date(iso) : now;
  if (Number.isNaN(date.getTime())) return "";
  const zone = safeTimeZone(timeZone);
  const options = zone ? { timeZone: zone } : {};
  const datePart = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  }).format(date);
  const timePart = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...options,
  }).format(date);
  return zone ? `${datePart} · ${timePart}` : `${datePart} · ${timePart} UTC`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+") && !trimmed.startsWith("+1")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  const national = digits.length >= 11 && digits.startsWith("1") ? digits.slice(1, 11) : digits.slice(0, 10);
  if (national.length !== 10) return trimmed;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

function absoluteUrl(value: string, origin: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!trimmed.startsWith("/")) return "";
  const base = origin.trim().replace(/\/+$/, "");
  return base ? `${base}${trimmed}` : "";
}

function safeHttpUrl(value: string) {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.href;
  } catch {
    return "";
  }
}

function safeImageUrl(value: string) {
  const trimmed = value.trim();
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+$/.test(trimmed)) return trimmed;
  return safeHttpUrl(trimmed);
}

export function estimateOpenedAmountLabel(input: EstimateOpenedNotify) {
  const total = estimateOpenedProposalTotal(input);
  return total == null ? "—" : formatMoney(total);
}

export type EstimateOpenedEmailLinks = {
  proposalUrl: string;
  jobUrl: string;
  settingsUrl: string;
  mapsUrl: string;
};

export function estimateOpenedEmailLinks(input: EstimateOpenedNotify, origin: string): EstimateOpenedEmailLinks {
  const address = estimateOpenedAddress(input);
  const proposalPath = input.estimateId?.trim() ? `/estimates/${input.estimateId.trim()}` : "/estimates";
  const jobPath = input.jobId?.trim() ? `/jobs?job=${encodeURIComponent(input.jobId.trim())}` : "";
  return {
    proposalUrl: safeHttpUrl(absoluteUrl(proposalPath, origin)),
    jobUrl: jobPath ? safeHttpUrl(absoluteUrl(jobPath, origin)) : "",
    settingsUrl: safeHttpUrl(absoluteUrl("/settings", origin)),
    mapsUrl: address.full
      ? safeHttpUrl(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.full)}`)
      : "",
  };
}

export function renderEstimateOpenedEmailHtml(input: {
  notify: EstimateOpenedNotify;
  origin: string;
  logoUrl?: string;
  headline?: string;
  message?: string;
  button?: string;
  now?: Date;
}) {
  const notify = input.notify;
  const address = estimateOpenedAddress(notify);
  const links = estimateOpenedEmailLinks(notify, input.origin);
  const viewer = estimateOpenedWho(notify.contactName);
  const number = notify.estimateNumber.trim();
  const label = estimateOpenedLabel(notify);
  const company = notify.companyName.trim() || "Your company";
  const zone = safeTimeZone(notify.staffTimeZone) || safeTimeZone(notify.viewerTimeZone);
  const openedAt = formatEstimateOpenedAt(notify.openedAt, zone, input.now ?? new Date());
  const openCount = Math.max(1, Math.round(Number(notify.openCount) || 0));
  const amount = estimateOpenedAmountLabel(notify);
  const jobCode = notify.jobCode.trim() || "—";
  const brand = estimateOpenedBrandColor(ESTIMATE_OPENED_BRAND_COLOR);
  const phone = formatPhone(notify.companyPhone ?? "");
  const logo = safeImageUrl(input.logoUrl ?? "");
  const button = input.button?.trim() || "View proposal";
  const headline =
    input.headline?.trim() || (number ? `Proposal ${number} was opened` : "A proposal was opened");
  const where = address.line;
  const intro = input.message?.trim()
    ? escapeHtml(input.message.trim()).replaceAll("\n", "<br>")
    : `${where ? `<strong style="color:#111827;">${escapeHtml(viewer)}</strong> opened the proposal for ${escapeHtml(where)}` : `<strong style="color:#111827;">${escapeHtml(viewer)}</strong> opened the proposal`}${openedAt ? ` on ${escapeHtml(openedAt)}` : ""}.`;
  const preheader = `${viewer} opened proposal ${label}${where ? ` for ${where}` : ""}.`;
  const propertyName = where
    ? links.mapsUrl
      ? `<a href="${escapeHtml(links.mapsUrl)}" style="display:block;margin-top:4px;font-size:16px;font-weight:700;color:#111827;">${escapeHtml(where)}</a>`
      : `<div style="display:block;margin-top:4px;font-size:16px;font-weight:700;color:#111827;">${escapeHtml(where)}</div>`
    : `<div style="display:block;margin-top:4px;font-size:16px;font-weight:700;color:#111827;">Address not on file</div>`;
  const cityHtml = address.city
    ? `<div style="font-size:14px;color:#4B5563;margin-top:2px;">${escapeHtml(address.city)}</div>`
    : "";
  const logoHtml = logo
    ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(company)}" height="40" style="display:block;height:40px;width:auto;border:0;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#111827;">`
    : `<span style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#111827;">${escapeHtml(company)}</span>`;
  const jobButton = links.jobUrl
    ? `<td class="stack btn stack-gap" valign="top" align="left" style="white-space:nowrap;">
                          <a href="${escapeHtml(links.jobUrl)}" style="display:inline-block;background:#FFFFFF;color:#111827;border:1px solid #D1D5DB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;line-height:44px;padding:0 24px;border-radius:8px;text-align:center;">Open job</a>
                        </td>`
    : "";
  const footerReason = notify.jobCode.trim()
    ? `You're receiving this because you're assigned to job ${notify.jobCode.trim()}.`
    : "You're receiving this because a proposal was opened.";

  return fill({
    title: escapeHtml(number ? `Proposal ${number} opened` : "Proposal opened"),
    preheader: escapeHtml(preheader),
    logo_html: logoHtml,
    brand_color: brand,
    headline: escapeHtml(headline),
    intro_html: intro,
    property_name_html: propertyName,
    address_city_html: cityHtml,
    estimate_number: escapeHtml(number || label),
    job_code: escapeHtml(jobCode),
    proposal_amount: escapeHtml(amount),
    open_count: escapeHtml(String(openCount)),
    proposal_url: escapeHtml(links.proposalUrl),
    button: escapeHtml(button),
    job_button_html: jobButton,
    company_name: escapeHtml(company),
    company_phone_html: phone ? ` &middot; ${escapeHtml(phone)}` : "",
    footer_reason: escapeHtml(footerReason),
    settings_url: escapeHtml(links.settingsUrl),
  });
}
