import { Resend } from "resend";

/** Verified sending domain in Resend for estimates, invoices, and pages. */
export const RESEND_FROM_DOMAIN = "updates.theroofingcrm.com";

/** Default From when RESEND_FROM_EMAIL is unset. */
export const DEFAULT_RESEND_FROM_EMAIL = `Truss <noreply@${RESEND_FROM_DOMAIN}>`;

export function resendApiKey() {
  return process.env.RESEND_API_KEY?.trim() || "";
}

/**
 * Verified sender for Resend.
 * Prefer `RESEND_FROM_EMAIL` / `RESEND_FROM` (e.g. `Northline <proposals@updates.theroofingcrm.com>`).
 * Bare local-parts like `proposals` become `proposals@updates.theroofingcrm.com`.
 */
export function resendFromEmail() {
  const configured = process.env.RESEND_FROM_EMAIL?.trim() || process.env.RESEND_FROM?.trim() || "";
  if (!configured) return DEFAULT_RESEND_FROM_EMAIL;

  const angled = configured.match(/^(.*)<([^>]+)>$/);
  if (angled) {
    const display = angled[1].trim();
    const address = normalizeFromAddress(angled[2].trim());
    return display ? `${display} <${address}>` : address;
  }

  return normalizeFromAddress(configured);
}

function normalizeFromAddress(value: string) {
  if (value.includes("@")) return value;
  const local = value.replace(/[^a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]/g, "") || "noreply";
  return `${local}@${RESEND_FROM_DOMAIN}`;
}

export function resendReplyTo() {
  return process.env.RESEND_REPLY_TO?.trim() || "";
}

export function isResendConfigured() {
  return Boolean(resendApiKey());
}

export function resendStatus() {
  return {
    configured: isResendConfigured(),
    from: resendFromEmail(),
    domain: RESEND_FROM_DOMAIN,
  };
}

export async function sendResendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}) {
  const to = input.to.trim();
  const subject = input.subject.replace(/[\r\n]+/g, " ").trim();
  const html = input.html.trim();
  const text = input.text.trim();
  if (!to || !subject || (!html && !text)) {
    return { ok: false as const, error: "Email is missing a recipient, subject, or body." };
  }

  if (!isResendConfigured()) {
    return { ok: true as const, mocked: true as const, id: "" };
  }

  const resend = new Resend(resendApiKey());
  const replyTo = input.replyTo?.trim() || resendReplyTo() || undefined;
  const { data, error } = await resend.emails.send({
    from: resendFromEmail(),
    to: [to],
    subject,
    html: html || text,
    text: text || html,
    ...(replyTo ? { replyTo } : {}),
  });

  if (error) {
    return { ok: false as const, error: error.message || "Resend could not send that email." };
  }
  return { ok: true as const, mocked: false as const, id: data?.id ?? "" };
}
