import { Resend } from "resend";

export function resendApiKey() {
  return process.env.RESEND_API_KEY?.trim() || "";
}

/** Verified sender, e.g. `Northline <proposals@mail.example.com>` or `proposals@mail.example.com`. */
export function resendFromEmail() {
  return process.env.RESEND_FROM_EMAIL?.trim() || process.env.RESEND_FROM?.trim() || "";
}

export function resendReplyTo() {
  return process.env.RESEND_REPLY_TO?.trim() || "";
}

export function isResendConfigured() {
  return Boolean(resendApiKey() && resendFromEmail());
}

export function resendStatus() {
  return {
    configured: isResendConfigured(),
    from: resendFromEmail(),
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
