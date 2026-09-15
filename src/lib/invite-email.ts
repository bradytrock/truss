import { INVITE_DAYS } from "@/lib/accounts";
import { looksLikeEmail } from "@/lib/share-text";

export type InviteEmailInput = {
  company: string;
  seatName: string;
  seatTitle: string;
  inviterName: string;
  signupUrl: string;
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
  return `Set up your ${name} account`;
}

export function inviteEmailText(input: InviteEmailInput) {
  const company = input.company.trim() || "the company";
  const who = input.seatName.trim() || "there";
  const title = input.seatTitle.trim();
  const inviter = input.inviterName.trim() || "A teammate";
  const seat = title ? ` as ${title}` : "";
  return [
    `Hi ${who},`,
    "",
    `${inviter} invited you to join ${company}${seat}.`,
    "This link is only for you, and it works once. After you set a password, it cannot be reused.",
    "",
    input.signupUrl,
    "",
    `The invite expires in ${INVITE_DAYS} days. If you were not expecting this, ignore the email.`,
  ].join("\n");
}

export function inviteEmailHtml(input: InviteEmailInput) {
  const company = escapeHtml(input.company.trim() || "the company");
  const who = escapeHtml(input.seatName.trim() || "there");
  const title = input.seatTitle.trim();
  const inviter = escapeHtml(input.inviterName.trim() || "A teammate");
  const url = escapeHtml(input.signupUrl);
  const seat = title ? ` as ${escapeHtml(title)}` : "";
  const subject = escapeHtml(inviteEmailSubject(input.company));
  return `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#e5e5e5;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a0a0a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e5e5e5;padding:36px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-collapse:collapse;">
            <tr>
              <td style="padding:32px 40px 20px;background:#0a0a0a;color:#fafafa;font-size:22px;font-weight:700;letter-spacing:-0.03em;">${company}</td>
            </tr>
            <tr>
              <td style="padding:32px 40px 8px;font-size:16px;line-height:1.6;color:#171717;">Hi ${who},</td>
            </tr>
            <tr>
              <td style="padding:0 40px 16px;font-size:16px;line-height:1.6;color:#404040;">${inviter} invited you to join ${company}${seat}. This link is only for you, and it works once.</td>
            </tr>
            <tr>
              <td style="padding:8px 40px 28px;">
                <a href="${url}" style="display:block;background:#0a0a0a;color:#ffffff;text-decoration:none;padding:16px 24px;font-size:15px;font-weight:700;text-align:center;">Set up your account</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 32px;font-size:13px;line-height:1.5;color:#737373;">Expires in ${INVITE_DAYS} days. After you set a password, this link cannot be reused.</td>
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
