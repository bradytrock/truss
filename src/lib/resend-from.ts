import { firstName } from "@/lib/phone";

/** Verified sending domain in Resend for estimates, invoices, and pages. */
export const RESEND_FROM_DOMAIN = "updates.theroofingcrm.com";

/** Fallback From when no project manager is on the send. */
export const DEFAULT_RESEND_FROM_EMAIL = `Truss <noreply@${RESEND_FROM_DOMAIN}>`;

function localPartFromName(value: string) {
  const first = firstName(value).toLowerCase().replace(/[^a-z0-9]/g, "");
  return first || "noreply";
}

export function resendMailbox(localPart: string) {
  const local = localPart.toLowerCase().replace(/[^a-z0-9._+-]/g, "") || "noreply";
  return `${local}@${RESEND_FROM_DOMAIN}`;
}

/** Display name: `Brady at T-Rock Roofing`. */
export function formatResendFromDisplay(senderName: string, companyName: string) {
  const who = firstName(senderName);
  const company = companyName.replace(/[\r\n]+/g, " ").trim() || "the office";
  return `${who} at ${company}`.replace(/[\r\n]+/g, " ").trim();
}

/**
 * Resend From header for a project manager send.
 * Example: `Brady at T-Rock Roofing <brady@updates.theroofingcrm.com>`
 */
export function formatResendFrom(input: { senderName: string; companyName: string }) {
  const display = formatResendFromDisplay(input.senderName, input.companyName);
  const address = resendMailbox(localPartFromName(input.senderName));
  return `${display} <${address}>`;
}
