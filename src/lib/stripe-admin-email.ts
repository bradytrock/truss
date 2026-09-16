import { formatResendFrom, isResendConfigured, sendResendEmail } from "@/lib/resend-mail";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function stripeRevokeEmailSubject(company: string) {
  return `${company.trim() || "Your company"} Stripe keys will be removed in 24 hours`;
}

export function stripeRevokeEmailText(input: {
  company: string;
  adminName: string;
  requestedBy: string;
  revokeAtLabel: string;
}) {
  const company = input.company.trim() || "the company";
  return [
    `Hi ${input.adminName.trim() || "there"},`,
    "",
    `${input.requestedBy} started removal of the Stripe keys for ${company}.`,
    `They come off at ${input.revokeAtLabel}. After that, card Pay disappears until a company admin connects Stripe again.`,
    "",
    "This wait is required. Keys cannot be changed immediately once they are locked.",
    "If you did not expect this, contact the other company admins right away.",
  ].join("\n");
}

export function stripeRevokeEmailHtml(input: {
  company: string;
  adminName: string;
  requestedBy: string;
  revokeAtLabel: string;
}) {
  const company = escapeHtml(input.company.trim() || "the company");
  const who = escapeHtml(input.adminName.trim() || "there");
  const requestedBy = escapeHtml(input.requestedBy);
  const when = escapeHtml(input.revokeAtLabel);
  const subject = escapeHtml(stripeRevokeEmailSubject(input.company));
  return `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:24px;background:#e5e5e5;font-family:ui-sans-serif,system-ui,sans-serif;color:#0a0a0a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#fff;">
      <tr><td style="padding:28px 36px;background:#0a0a0a;color:#fafafa;font-size:20px;font-weight:700;">${company}</td></tr>
      <tr><td style="padding:28px 36px 8px;font-size:16px;line-height:1.6;">Hi ${who},</td></tr>
      <tr><td style="padding:0 36px 16px;font-size:16px;line-height:1.6;color:#404040;">${requestedBy} started removal of the Stripe keys for ${company}. They come off at <strong>${when}</strong>.</td></tr>
      <tr><td style="padding:0 36px 28px;font-size:16px;line-height:1.6;color:#404040;">After that, card Pay is off until a company admin connects Stripe again. If you did not expect this, contact the other company admins right away.</td></tr>
    </table>
  </body>
</html>`;
}

export async function emailCompanyAdminsStripeRevoke(input: {
  company: string;
  requestedBy: string;
  revokeAtLabel: string;
  replyTo: string;
  admins: Array<{ name: string; email: string }>;
}) {
  if (!isResendConfigured()) {
    return { sent: 0, failed: input.admins.length, configured: false };
  }
  const from = formatResendFrom({ senderName: input.requestedBy, companyName: input.company });
  let sent = 0;
  let failed = 0;
  for (const admin of input.admins) {
    const to = admin.email.trim();
    if (!to) {
      failed += 1;
      continue;
    }
    const payload = {
      company: input.company,
      adminName: admin.name,
      requestedBy: input.requestedBy,
      revokeAtLabel: input.revokeAtLabel,
    };
    const result = await sendResendEmail({
      to,
      subject: stripeRevokeEmailSubject(input.company),
      html: stripeRevokeEmailHtml(payload),
      text: stripeRevokeEmailText(payload),
      from,
      replyTo: input.replyTo,
    });
    if (result.ok) sent += 1;
    else failed += 1;
  }
  return { sent, failed, configured: true };
}
