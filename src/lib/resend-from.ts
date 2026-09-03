import { firstName } from "@/lib/phone";

/** Verified sending domain in Resend for estimates, invoices, and pages. */
export const RESEND_FROM_DOMAIN = "updates.theroofingcrm.com";

/** Only verified mailbox on the updates domain — required for Resend delivery. */
export const RESEND_FROM_ADDRESS = `no-reply@${RESEND_FROM_DOMAIN}`;

/** Fallback From when no project manager is on the send. */
export const DEFAULT_RESEND_FROM_EMAIL = `Truss <${RESEND_FROM_ADDRESS}>`;

export function resendMailbox(_localPart?: string) {
  return RESEND_FROM_ADDRESS;
}

/** Display name: `Brady at T-Rock Roofing`. */
export function formatResendFromDisplay(senderName: string, companyName: string) {
  const who = firstName(senderName);
  const company = companyName.replace(/[\r\n]+/g, " ").trim() || "the office";
  return `${who} at ${company}`.replace(/[\r\n]+/g, " ").trim();
}

/**
 * Resend From header for a project manager send.
 * Display name is the PM; mailbox is always no-reply@updates.theroofingcrm.com.
 * Example: `Brady at T-Rock Roofing <no-reply@updates.theroofingcrm.com>`
 */
export function formatResendFrom(input: { senderName: string; companyName: string }) {
  const display = formatResendFromDisplay(input.senderName, input.companyName);
  return `${display} <${RESEND_FROM_ADDRESS}>`;
}
