import { websiteHref } from "@/lib/card";
import { formatCompanyAddress, formatDate, formatPhone } from "@/lib/format";
import { digitsOnly, firstName, toE164 } from "@/lib/phone";
import { PROJECT_TYPE_LABELS, type ProjectType } from "@/lib/types";

export type ProposalEmailOwner = {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
};

function absoluteAssetUrl(url: string, origin = "") {
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function displayWebsite(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

function telValue(phone: string) {
  return toE164(phone) || digitsOnly(phone);
}

export function proposalScopeSummary(input: {
  projectType?: string | null;
  packageMode?: string | null;
  name?: string | null;
  street?: string | null;
}) {
  const type = input.projectType?.trim() ?? "";
  if (type && type in PROJECT_TYPE_LABELS) {
    return PROJECT_TYPE_LABELS[type as ProjectType];
  }
  if (input.packageMode === "gbb") return "Proposal options";
  const name = input.name?.trim() ?? "";
  const street = input.street?.trim() ?? "";
  if (name && street && (name === street || name.startsWith(`${street},`) || name.startsWith(`${street} `))) {
    return "See proposal for full scope";
  }
  return name || "See proposal for full scope";
}

export type ProposalEmailInput = {
  company: string;
  customer: string;
  number: string;
  name: string;
  url: string;
  logoUrl?: string;
  owner?: ProposalEmailOwner | null;
  origin?: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  validUntil?: string | null;
  scope?: string;
  companyWebsite?: string;
  companyPhone?: string;
  companyStreet?: string;
  companyCity?: string;
  companyState?: string;
  companyPostalCode?: string;
  summaryLines?: Array<{ label: string; amount: number | null }>;
  summaryTotal?: number | null;
  summaryOptions?: Array<{
    name: string;
    total: number;
    selected?: boolean;
    recommended?: boolean;
    highlights?: string[];
    delta?: number | null;
    vs?: string | null;
  }>;
};

function formatEmailMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function proposalEmailOptionsBlock(input: ProposalEmailInput) {
  const options = input.summaryOptions ?? [];
  if (options.length < 2) return "";
  const cards = options
    .map((option) => {
      const badge = option.selected
        ? `<div style="padding-bottom:6px;font-size:11px;line-height:14px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#b51e28;">Your pick</div>`
        : option.recommended
          ? `<div style="padding-bottom:6px;font-size:11px;line-height:14px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#8a857f;">Most chosen</div>`
          : "";
      const highlights = (option.highlights ?? [])
        .slice(0, 4)
        .map((item) => `<div style="padding-top:3px;">· ${escapeHtml(item)}</div>`)
        .join("");
      const delta =
        option.delta != null && option.vs
          ? `<div style="padding-top:4px;font-size:12px;line-height:16px;color:#6b6763;">+${escapeHtml(formatEmailMoney(option.delta))} vs ${escapeHtml(option.vs)}</div>`
          : "";
      const border = option.selected ? "#1a1a1a" : "#e6e2dc";
      return `<td class="stack" valign="top" width="${Math.floor(100 / options.length)}%" style="padding:0 6px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${border};border-radius:10px;">
                          <tr>
                            <td style="padding:14px 16px;font-family:Helvetica,Arial,sans-serif;">
                              ${badge}
                              <div style="font-size:13px;line-height:18px;font-weight:bold;color:#1a1a1a;">${escapeHtml(option.name)}</div>
                              <div style="padding-top:4px;font-size:18px;line-height:22px;font-weight:bold;color:#1a1a1a;">${escapeHtml(formatEmailMoney(option.total))}</div>
                              ${delta}
                              ${highlights ? `<div style="padding-top:8px;font-size:12px;line-height:16px;color:#4a4744;">${highlights}</div>` : ""}
                            </td>
                          </tr>
                        </table>
                      </td>`;
    })
    .join("");
  return `
                <tr>
                  <td class="px" style="padding:24px 38px 0 38px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>${cards}</tr>
                    </table>
                  </td>
                </tr>`;
}

function proposalEmailSummaryBlock(input: ProposalEmailInput) {
  const rows = (input.summaryLines ?? []).filter((row) => row.label.trim());
  if (!rows.length) return "";
  const lineRows = rows
    .map((row, index) => {
      const top = index === 0 ? "4px" : "14px";
      const bottom = index === rows.length - 1 ? "16px" : "14px";
      const amount =
        row.amount == null
          ? `<td style="padding:${top} 0 ${bottom} 16px;border-bottom:1px solid #ece8e2;"></td>`
          : `<td align="right" valign="top" style="padding:${top} 0 ${bottom} 16px;border-bottom:1px solid #ece8e2;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#1a1a1a;white-space:nowrap;">${escapeHtml(formatEmailMoney(row.amount))}</td>`;
      return `<tr>
                              <td valign="top" style="padding:${top} 16px ${bottom} 0;border-bottom:1px solid #ece8e2;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#1a1a1a;">${escapeHtml(row.label)}</td>
                              ${amount}
                            </tr>`;
    })
    .join("");
  const total =
    input.summaryTotal == null
      ? ""
      : `<tr>
                              <td valign="top" style="padding:16px 16px 0 0;border-top:2px solid #1a1a1a;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;font-weight:bold;color:#1a1a1a;">Total</td>
                              <td align="right" valign="top" style="padding:16px 0 0 16px;border-top:2px solid #1a1a1a;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;font-weight:bold;color:#1a1a1a;white-space:nowrap;">${escapeHtml(formatEmailMoney(input.summaryTotal))}</td>
                            </tr>`;
  return `
                <tr>
                  <td class="px" style="padding:24px 44px 0 44px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${lineRows}
                      ${total}
                    </table>
                  </td>
                </tr>`;
}

export function renderProposalEmailHtml(input: ProposalEmailInput) {
  const company = input.company.trim() || "Your contractor";
  const companyEsc = escapeHtml(company);
  const customerFirst = escapeHtml(firstName(input.customer));
  const url = escapeHtml(input.url);
  const number = escapeHtml(input.number.trim() || "Proposal");
  const street = escapeHtml(input.street?.trim() || input.name.trim() || "Your property");
  const city = escapeHtml(input.city?.trim() ?? "");
  const state = escapeHtml(input.state?.trim() ?? "");
  const zip = escapeHtml(input.postalCode?.trim() ?? "");
  const locality = [city, state].filter(Boolean).join(", ");
  const cityLine = [locality, zip].filter(Boolean).join(" ");
  const scope = escapeHtml(input.scope?.trim() || proposalScopeSummary(input));
  const expires = escapeHtml(
    input.validUntil ? formatDate(input.validUntil) : "See proposal",
  );

  const websiteRaw = input.companyWebsite?.trim() ?? "";
  const websiteUrl = websiteHref(websiteRaw);
  const websiteDisplay = displayWebsite(websiteRaw);
  const websiteHrefEsc = escapeHtml(websiteUrl);
  const websiteDisplayEsc = escapeHtml(websiteDisplay);

  const companyPhone = input.companyPhone?.trim() ?? "";
  const companyPhoneLabel = companyPhone ? formatPhone(companyPhone) : "";
  const companyPhoneTel = telValue(companyPhone);
  const companyAddress = formatCompanyAddress({
    street: input.companyStreet?.trim() ?? "",
    city: input.companyCity?.trim() ?? "",
    state: input.companyState?.trim() ?? "",
    postalCode: input.companyPostalCode?.trim() ?? "",
  });

  const logo = absoluteAssetUrl(input.logoUrl || "", input.origin);
  const logoSrc = escapeHtml(logo);
  const logoBlock = logo
    ? `<img src="${logoSrc}" width="150" alt="${companyEsc}" style="width:150px;height:auto;">`
    : `<span style="font-family:Helvetica,Arial,sans-serif;font-size:18px;line-height:22px;font-weight:bold;color:#1a1a1a;">${companyEsc}</span>`;
  const logoLinked = websiteUrl
    ? `<a href="${websiteHrefEsc}" style="text-decoration:none;">${logoBlock}</a>`
    : logoBlock;

  const owner = input.owner;
  const pmName = owner?.name?.trim() ?? "";
  const pmFirst = escapeHtml(firstName(pmName || "your project manager"));
  const pmFull = escapeHtml(pmName);
  const pmPhone = owner?.phone?.trim() ?? "";
  const pmPhoneLabel = pmPhone ? formatPhone(pmPhone) : "";
  const pmPhoneTel = telValue(pmPhone);
  const pmEmail = owner?.email?.trim() ?? "";
  const pmPhoto = absoluteAssetUrl(owner?.photoUrl || "", input.origin);

  const pmPhotoHtml = pmPhoto
    ? `<img src="${escapeHtml(pmPhoto)}" width="56" height="56" alt="" style="width:56px;height:56px;border-radius:28px;background:#d9d4cc;">`
    : `<div style="width:56px;height:56px;border-radius:28px;background:#d9d4cc;"></div>`;

  const pmLinks: string[] = [];
  if (pmPhoneTel) {
    pmLinks.push(
      `<a href="tel:${escapeHtml(pmPhoneTel)}" style="color:#b51e28;font-weight:bold;text-decoration:none;">${escapeHtml(pmPhoneLabel)}</a>`,
    );
  }
  if (pmEmail) {
    pmLinks.push(
      `<a href="mailto:${escapeHtml(pmEmail)}" style="color:#b51e28;font-weight:bold;text-decoration:none;">${escapeHtml(pmEmail)}</a>`,
    );
  }
  const pmContact =
    pmLinks.join(`\n                                  <span style="color:#c4bfb8;">&nbsp;&nbsp;|&nbsp;&nbsp;</span>\n                                  `);

  const pmBlock = pmName
    ? `
                <tr>
                  <td class="px" style="padding:0 44px 36px 44px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f5f1;border-radius:10px;">
                      <tr>
                        <td style="padding:20px 22px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td width="56" valign="top">
                                ${pmPhotoHtml}
                              </td>
                              <td valign="top" style="padding-left:16px;font-family:Helvetica,Arial,sans-serif;">
                                <div style="font-size:11px;line-height:14px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#8a857f;">Your project manager</div>
                                <div style="padding-top:4px;font-size:17px;line-height:22px;font-weight:bold;color:#1a1a1a;">${pmFull}</div>
                                <div style="padding-top:2px;font-size:14px;line-height:20px;color:#4a4744;">Questions? Call or text me directly.</div>
                                ${
                                  pmContact
                                    ? `<div style="padding-top:10px;font-size:14px;line-height:20px;">
                                  ${pmContact}
                                </div>`
                                    : ""
                                }
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`
    : "";

  const footerWebsite = websiteUrl
    ? `<a href="${websiteHrefEsc}" style="color:#a09b95;text-decoration:underline;">${websiteDisplayEsc}</a>`
    : "";
  const footerPhone = companyPhoneTel
    ? `<a href="tel:${escapeHtml(companyPhoneTel)}" style="color:#a09b95;text-decoration:none;">${escapeHtml(companyPhoneLabel)}</a>`
    : "";
  const footerBits = [footerWebsite, footerPhone].filter(Boolean).join("\n              &nbsp;·&nbsp; ");

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Your proposal from ${companyEsc}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <style>table,td,div,p,a{font-family:Arial,Helvetica,sans-serif !important;}</style>
  <![endif]-->
  <style>
    :root { color-scheme: light; supported-color-schemes: light; }
    body { margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; background:#f1efeb; }
    table { border-collapse:collapse; mso-table-lspace:0; mso-table-rspace:0; }
    img { border:0; line-height:100%; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; display:block; }
    a { color:#b51e28; }
    .btn:hover { background:#8f1119 !important; }
    @media only screen and (max-width: 620px) {
      .container { width:100% !important; }
      .px { padding-left:24px !important; padding-right:24px !important; }
      .hero-title { font-size:28px !important; line-height:34px !important; }
      .stack { display:block !important; width:100% !important; }
      .stack-gap { padding-top:12px !important; padding-left:0 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f1efeb;">

  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f1efeb;">
    Your roofing proposal for ${street} is ready to review and sign — takes about two minutes, no account needed.
    &#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1efeb;">
    <tr>
      <td align="center" style="padding:32px 12px;">

        <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

          <tr>
            <td class="px" style="padding:0 8px 18px 8px;" align="left">
              ${logoLinked}
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

                <tr>
                  <td style="background:#161616;border-radius:14px 14px 0 0;background-image:linear-gradient(135deg,#1c1c1c 0%,#0f0f0f 100%);">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="px" style="padding:40px 44px 36px 44px;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="background:#b51e28;border-radius:4px;padding:5px 10px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:14px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#ffffff;">
                                Proposal ready
                              </td>
                              <td style="padding-left:10px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:14px;color:#9a9691;letter-spacing:0.06em;">
                                ${number}
                              </td>
                            </tr>
                          </table>
                          <div class="hero-title" style="padding-top:18px;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:40px;font-weight:normal;color:#ffffff;letter-spacing:-0.01em;">
                            Hi ${customerFirst}, your roof proposal is&nbsp;ready.
                          </div>
                          <div style="padding-top:12px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#c9c5bf;">
                            ${pmName ? `${pmFirst} put this together after walking your roof. ` : ""}Take a look, pick the option that fits, and sign right from your phone.
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td class="px" style="padding:32px 44px 0 44px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e6e2dc;border-radius:10px;">
                      <tr>
                        <td style="padding:20px 22px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td class="stack" width="50%" valign="top" style="font-family:Helvetica,Arial,sans-serif;">
                                <div style="font-size:11px;line-height:14px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#8a857f;">Job address</div>
                                <div style="padding-top:6px;font-size:16px;line-height:22px;font-weight:bold;color:#1a1a1a;">${street}</div>
                                ${cityLine ? `<div style="font-size:15px;line-height:22px;color:#4a4744;">${cityLine}</div>` : ""}
                              </td>
                              <td class="stack stack-gap" width="50%" valign="top" style="padding-left:20px;font-family:Helvetica,Arial,sans-serif;">
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                  <tr>
                                    <td style="padding-bottom:10px;">
                                      <div style="font-size:11px;line-height:14px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#8a857f;">Scope</div>
                                      <div style="padding-top:4px;font-size:15px;line-height:20px;color:#1a1a1a;">${scope}</div>
                                    </td>
                                  </tr>
                                  <tr>
                                    <td>
                                      <div style="font-size:11px;line-height:14px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#8a857f;">Valid through</div>
                                      <div style="padding-top:4px;font-size:15px;line-height:20px;color:#1a1a1a;">${expires}</div>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
${proposalEmailOptionsBlock(input)}
${proposalEmailSummaryBlock(input)}
                <tr>
                  <td class="px" align="center" style="padding:28px 44px 8px 44px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:54px;v-text-anchor:middle;width:512px;" arcsize="15%" strokecolor="#b51e28" fillcolor="#b51e28">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:17px;font-weight:bold;">Review &amp; sign</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${url}" class="btn" style="display:block;background:#b51e28;border-radius:999px;padding:17px 24px;font-family:Helvetica,Arial,sans-serif;font-size:17px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;text-align:center;mso-hide:all;">
                      Review &amp; sign
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
                <tr>
                  <td class="px" align="center" style="padding:0 44px 28px 44px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:18px;color:#8a857f;">
                    Takes about two minutes. No account or app required.
                  </td>
                </tr>

                <tr>
                  <td class="px" style="padding:0 44px 32px 44px;border-top:1px solid #ece8e2;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                      <tr>
                        <td class="stack" width="33%" valign="top" style="padding-right:12px;font-family:Helvetica,Arial,sans-serif;">
                          <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:26px;color:#b51e28;">1</div>
                          <div style="padding-top:6px;font-size:14px;line-height:20px;font-weight:bold;color:#1a1a1a;">Review the scope</div>
                          <div style="padding-top:2px;font-size:13px;line-height:19px;color:#6b6763;">Materials, warranty, and what's included, line by line.</div>
                        </td>
                        <td class="stack stack-gap" width="33%" valign="top" style="padding:0 6px;font-family:Helvetica,Arial,sans-serif;">
                          <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:26px;color:#b51e28;">2</div>
                          <div style="padding-top:6px;font-size:14px;line-height:20px;font-weight:bold;color:#1a1a1a;">Pick your option</div>
                          <div style="padding-top:2px;font-size:13px;line-height:19px;color:#6b6763;">Choose the shingle and upgrade options that fit your budget.</div>
                        </td>
                        <td class="stack stack-gap" width="33%" valign="top" style="padding-left:12px;font-family:Helvetica,Arial,sans-serif;">
                          <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:26px;color:#b51e28;">3</div>
                          <div style="padding-top:6px;font-size:14px;line-height:20px;font-weight:bold;color:#1a1a1a;">Sign &amp; schedule</div>
                          <div style="padding-top:2px;font-size:13px;line-height:19px;color:#6b6763;">E-sign on your phone and we'll get you on the calendar.</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
${pmBlock}

              </table>
            </td>
          </tr>

          <tr>
            <td class="px" align="center" style="padding:28px 24px 8px 24px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#8a857f;">
              Button not working? Copy this link into your browser:<br>
              <a href="${url}" style="color:#6b6763;word-break:break-all;">${url}</a>
            </td>
          </tr>
          <tr>
            <td class="px" align="center" style="padding:16px 24px 0 24px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#a09b95;">
              <strong style="color:#6b6763;">${companyEsc}</strong>${companyAddress ? `<br>\n              ${escapeHtml(companyAddress)}` : ""}${footerBits ? `<br>\n              ${footerBits}` : ""}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:14px 24px 0 24px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:16px;color:#b3aea7;">
              You're receiving this because ${companyEsc} prepared a proposal for you. This is a transactional message about your project.
            </td>
          </tr>

        </table>
        <!--[if mso]></td></tr></table><![endif]-->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderProposalEmailText(input: ProposalEmailInput) {
  const company = input.company.trim() || "Your contractor";
  const who = firstName(input.customer);
  const street = input.street?.trim() || input.name.trim() || "your property";
  const city = input.city?.trim() ?? "";
  const state = input.state?.trim() ?? "";
  const zip = input.postalCode?.trim() ?? "";
  const locality = [city, state].filter(Boolean).join(", ");
  const cityLine = [locality, zip].filter(Boolean).join(" ");
  const scope = input.scope?.trim() || proposalScopeSummary(input);
  const expires = input.validUntil ? formatDate(input.validUntil) : "See proposal";
  const pmName = input.owner?.name?.trim() ?? "";
  const pmFirst = firstName(pmName || "your project manager");
  const parts = [
    `Your roofing proposal for ${street} is ready to review and sign — takes about two minutes, no account needed.`,
    "",
    `Hi ${who}, your roof proposal is ready.`,
    pmName
      ? `${pmFirst} put this together after walking your roof. Take a look, pick the option that fits, and sign right from your phone.`
      : "Take a look, pick the option that fits, and sign right from your phone.",
    "",
    "Job address",
    street,
  ];
  if (cityLine) parts.push(cityLine);
  const summaryOptions = input.summaryOptions ?? [];
  if (summaryOptions.length > 1) {
    parts.push("", "Options");
    for (const option of summaryOptions) {
      const tags = [option.selected ? "your pick" : "", option.recommended ? "most chosen" : ""]
        .filter(Boolean)
        .join(", ");
      const delta =
        option.delta != null && option.vs ? `  (+${formatEmailMoney(option.delta)} vs ${option.vs})` : "";
      parts.push(`${option.name}${tags ? ` (${tags})` : ""}  ${formatEmailMoney(option.total)}${delta}`);
      for (const item of option.highlights ?? []) parts.push(`  · ${item}`);
    }
  }
  const summaryLines = (input.summaryLines ?? []).filter((row) => row.label.trim());
  if (summaryLines.length) {
    parts.push("");
    for (const row of summaryLines) {
      parts.push(row.amount == null ? row.label : `${row.label}  ${formatEmailMoney(row.amount)}`);
    }
    if (input.summaryTotal != null) {
      parts.push(`Total  ${formatEmailMoney(input.summaryTotal)}`);
    }
  }
  parts.push("", "Scope", scope, "", "Valid through", expires, "", "Review & sign:", input.url);
  if (pmName) {
    parts.push("", "Your project manager", pmName, "Questions? Call or text me directly.");
    if (input.owner?.phone?.trim()) parts.push(formatPhone(input.owner.phone));
    if (input.owner?.email?.trim()) parts.push(input.owner.email.trim());
  }
  parts.push("", company);
  const companyAddress = formatCompanyAddress({
    street: input.companyStreet?.trim() ?? "",
    city: input.companyCity?.trim() ?? "",
    state: input.companyState?.trim() ?? "",
    postalCode: input.companyPostalCode?.trim() ?? "",
  });
  if (companyAddress) parts.push(companyAddress);
  if (input.companyWebsite?.trim()) parts.push(displayWebsite(input.companyWebsite));
  if (input.companyPhone?.trim()) parts.push(formatPhone(input.companyPhone));
  return parts.join("\n");
}
