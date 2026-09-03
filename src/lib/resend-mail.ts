import { Resend } from "resend";
import {
  DEFAULT_RESEND_FROM_EMAIL,
  formatResendFromDisplay,
  RESEND_FROM_ADDRESS,
  RESEND_FROM_DOMAIN,
} from "@/lib/resend-from";

export {
  DEFAULT_RESEND_FROM_EMAIL,
  formatResendFrom,
  formatResendFromDisplay,
  RESEND_FROM_ADDRESS,
  RESEND_FROM_DOMAIN,
  resendMailbox,
} from "@/lib/resend-from";

export function resendApiKey() {
  return process.env.RESEND_API_KEY?.trim() || "";
}

/**
 * From always uses no-reply@updates.theroofingcrm.com (required for Resend delivery).
 * Optional RESEND_FROM_EMAIL may set the display name only.
 */
export function resendFromEmail() {
  const configured = process.env.RESEND_FROM_EMAIL?.trim() || process.env.RESEND_FROM?.trim() || "";
  if (!configured) return DEFAULT_RESEND_FROM_EMAIL;

  const angled = configured.match(/^(.*)<([^>]+)>$/);
  if (angled) {
    const display = angled[1].trim();
    return display ? `${display} <${RESEND_FROM_ADDRESS}>` : RESEND_FROM_ADDRESS;
  }

  if (configured.includes("@")) {
    return RESEND_FROM_ADDRESS;
  }
  return `${configured} <${RESEND_FROM_ADDRESS}>`;
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
    address: RESEND_FROM_ADDRESS,
  };
}

/** Keep display name; force the verified no-reply mailbox. */
export function enforceResendFrom(from: string) {
  const trimmed = from.trim();
  if (!trimmed) return DEFAULT_RESEND_FROM_EMAIL;
  const angled = trimmed.match(/^(.*)<([^>]+)>$/);
  if (angled) {
    const display = angled[1].trim();
    return display ? `${display} <${RESEND_FROM_ADDRESS}>` : RESEND_FROM_ADDRESS;
  }
  if (trimmed.includes("@")) return RESEND_FROM_ADDRESS;
  return `${formatResendFromDisplay(trimmed, "Truss")} <${RESEND_FROM_ADDRESS}>`;
}

export async function sendResendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Project manager display name; mailbox is always no-reply@updates… */
  from?: string;
  /** Always the project manager’s real inbox. */
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

  const from = enforceResendFrom(input.from?.trim() || resendFromEmail());
  const replyTo = input.replyTo?.trim() || resendReplyTo() || undefined;
  if (!replyTo) {
    return {
      ok: false as const,
      error: "The project manager needs an email on their profile before you can send.",
    };
  }

  const resend = new Resend(resendApiKey());
  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    subject,
    html: html || text,
    text: text || html,
    replyTo,
  });

  if (error) {
    return { ok: false as const, error: error.message || "Resend could not send that email." };
  }
  return { ok: true as const, mocked: false as const, id: data?.id ?? "", from };
}
