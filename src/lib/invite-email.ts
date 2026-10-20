import { INVITE_DAYS } from "@/lib/accounts";
import { absoluteShareAssetUrl, looksLikeEmail } from "@/lib/share-text";

export type InviteEmailInput = {
  company: string;
  seatName: string;
  seatTitle: string;
  inviterName: string;
  signupUrl: string;
  email?: string;
  logoUrl?: string;
  subject?: string;
  headline?: string;
  message?: string;
  button?: string;
};

export type InviteEmailSendResult = {
  staffId: string;
  email: string;
  name: string;
  ok: boolean;
  mocked?: boolean;
  error?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function inviteEmailSubject(company: string) {
  const name = company.trim() || "your company";
  return `Join ${name}`;
}

const INVITE_FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function inviteCopy(input: InviteEmailInput) {
  const company = input.company.trim() || "the company";
  return {
    company,
    headline: input.headline?.trim() || "Your invitation",
    message:
      input.message?.trim() ||
      `You are invited to join ${company}.\n\nThis invitation will expire in ${INVITE_DAYS} days.`,
    button: input.button?.trim() || "Accept invitation",
  };
}

/** Absolute http(s) logo, or blank when email clients cannot load the file. */
export function inviteEmailLogoUrl(value: string | null | undefined, origin = "") {
  const absolute = absoluteShareAssetUrl(value?.trim() || "", origin);
  if (!/^https?:\/\//i.test(absolute)) return "";
  try {
    const parsed = new URL(absolute);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.href;
  } catch {
    return "";
  }
}

export function inviteEmailText(input: InviteEmailInput) {
  const copy = inviteCopy(input);
  return [copy.headline, "", copy.message.trim(), "", input.signupUrl.trim()].join("\n");
}

function messageHtml(message: string) {
  return message
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;font-family:${INVITE_FONT};font-size:16px;line-height:26px;color:#111827;">${escapeHtml(block).replaceAll("\n", "<br>")}</p>`,
    )
    .join("");
}

export function inviteEmailHtml(input: InviteEmailInput) {
  const copy = inviteCopy(input);
  const company = escapeHtml(copy.company);
  const url = escapeHtml(input.signupUrl.trim());
  const headline = escapeHtml(copy.headline);
  const button = escapeHtml(copy.button);
  const subject = escapeHtml(input.subject?.trim() || inviteEmailSubject(copy.company));
  const logo = inviteEmailLogoUrl(input.logoUrl);
  const year = new Date().getFullYear();
  const logoBlock = logo
    ? `<img src="${escapeHtml(logo)}" width="140" alt="${company}" style="display:block;width:140px;max-width:140px;height:auto;border:0;outline:none;text-decoration:none;">`
    : `<div style="font-family:${INVITE_FONT};font-size:20px;line-height:26px;font-weight:700;color:#111827;">${company}</div>`;
  const buttonBlock = button
    ? `<tr>
              <td style="padding:8px 0 22px;">
                <a href="${url}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-family:${INVITE_FONT};font-size:15px;line-height:20px;font-weight:600;">${button}</a>
              </td>
            </tr>`
    : "";
  const preheader = escapeHtml(copy.message.split(/\n{2,}/).map((block) => block.trim()).find(Boolean) || copy.headline);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;font-family:${INVITE_FONT};color:#111827;">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;">
      <tr>
        <td align="left" style="padding:40px 24px 48px;">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;">
            <tr>
              <td style="padding:0 0 32px;" align="left">${logoBlock}</td>
            </tr>
            <tr>
              <td style="padding:0 0 16px;font-family:${INVITE_FONT};font-size:24px;line-height:32px;font-weight:700;letter-spacing:-0.02em;color:#1e293b;">${headline}</td>
            </tr>
            <tr>
              <td style="padding:0;">${messageHtml(copy.message)}</td>
            </tr>
            ${buttonBlock}
            <tr>
              <td style="padding:0 0 8px;font-family:${INVITE_FONT};font-size:16px;line-height:26px;color:#111827;">If you're having trouble with the above button, <a href="${url}" style="color:#111827;text-decoration:underline;">click here</a>.</td>
            </tr>
            <tr>
              <td style="padding:36px 0 0;">
                <div style="border-top:1px dotted #d4d4d8;padding-top:18px;font-family:${INVITE_FONT};font-size:14px;line-height:20px;color:#6b7280;">© ${year} ${company}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function parseInviteEmailStaffIds(body: Record<string, unknown>) {
  const raw = Array.isArray(body.staffIds) ? body.staffIds : [body.staffId];
  const ids = raw
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

export function inviteEmailAllowed(signupUrl: string, origin: string) {
  try {
    const parsed = new URL(signupUrl);
    const allowed = new URL(origin).origin;
    if (parsed.origin !== allowed) return false;
    if (parsed.pathname !== "/signup") return false;
    return Boolean(parsed.searchParams.get("invite")?.trim());
  } catch {
    return false;
  }
}

export function canEmailInvite(email: string) {
  return looksLikeEmail(email);
}

export async function requestInviteEmails(staffIds: string[]) {
  const response = await fetch("/api/people/invite-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ staffIds }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    sent?: number;
    failed?: number;
    configured?: boolean;
    results?: InviteEmailSendResult[];
  };
  if (!response.ok) {
    return {
      ok: false as const,
      error: data.error || "Could not email those invites.",
      sent: 0,
      failed: staffIds.length,
      results: data.results ?? [],
    };
  }
  return {
    ok: (data.failed ?? 1) === 0,
    error: data.error,
    sent: data.sent ?? 0,
    failed: data.failed ?? 0,
    configured: data.configured,
    results: data.results ?? [],
  };
}
