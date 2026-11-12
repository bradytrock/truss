/** Delivery states Resend reports on a sent email. */
export const EMAIL_DELIVERY_STATUSES = [
  "queued",
  "scheduled",
  "sent",
  "delivery_delayed",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "failed",
  "suppressed",
  "complained",
  "canceled",
  "mocked",
] as const;

export type EmailDeliveryStatus = (typeof EMAIL_DELIVERY_STATUSES)[number];

const STATUS_SET = new Set<string>(EMAIL_DELIVERY_STATUSES);

export const EMAIL_STATUS_LABELS: Record<EmailDeliveryStatus, string> = {
  queued: "Queued",
  scheduled: "Scheduled",
  sent: "Sent",
  delivery_delayed: "Delayed",
  delivered: "Delivered",
  opened: "Opened",
  clicked: "Clicked",
  bounced: "Bounced",
  failed: "Failed",
  suppressed: "Suppressed",
  complained: "Marked spam",
  canceled: "Canceled",
  mocked: "Not sent",
};

/** Higher ranks replace earlier ones. A late "sent" webhook must not cover "delivered". */
const STATUS_RANK: Record<EmailDeliveryStatus, number> = {
  mocked: 5,
  queued: 10,
  scheduled: 10,
  sent: 20,
  delivery_delayed: 30,
  canceled: 40,
  failed: 45,
  suppressed: 45,
  bounced: 45,
  delivered: 50,
  complained: 60,
  opened: 70,
  clicked: 80,
};

const OPEN_STATUSES = new Set<EmailDeliveryStatus>([
  "queued",
  "scheduled",
  "sent",
  "delivery_delayed",
]);

export function normalizeEmailStatus(value: string | null | undefined): EmailDeliveryStatus | "" {
  const status = value?.trim().toLowerCase() ?? "";
  return STATUS_SET.has(status) ? (status as EmailDeliveryStatus) : "";
}

export function emailStatusLabel(value: string | null | undefined) {
  const status = normalizeEmailStatus(value);
  return status ? EMAIL_STATUS_LABELS[status] : "";
}

export function emailStatusRank(value: string | null | undefined) {
  const status = normalizeEmailStatus(value);
  return status ? STATUS_RANK[status] : 0;
}

/** Keep the further-along status when events arrive out of order. */
export function nextEmailStatus(current: string | null | undefined, incoming: string | null | undefined) {
  const next = normalizeEmailStatus(incoming);
  if (!next) return normalizeEmailStatus(current);
  const previous = normalizeEmailStatus(current);
  if (!previous) return next;
  return emailStatusRank(next) >= emailStatusRank(previous) ? next : previous;
}

/** Still waiting on Resend, so the job page should pull last_event. */
export function emailStatusNeedsRefresh(value: string | null | undefined) {
  const status = normalizeEmailStatus(value);
  return Boolean(status && OPEN_STATUSES.has(status));
}

export function emailStatusTone(value: string | null | undefined): "ok" | "bad" | "wait" | "muted" | "" {
  const status = normalizeEmailStatus(value);
  if (!status) return "";
  if (status === "delivered" || status === "opened" || status === "clicked") return "ok";
  if (status === "bounced" || status === "failed" || status === "suppressed" || status === "complained") {
    return "bad";
  }
  if (status === "canceled" || status === "mocked") return "muted";
  return "wait";
}

/** Map a Resend webhook type such as `email.delivered` onto a status. */
export function emailStatusFromEventType(type: string | null | undefined) {
  const raw = type?.trim().toLowerCase() ?? "";
  if (!raw.startsWith("email.")) return "";
  return normalizeEmailStatus(raw.slice("email.".length));
}

export function outboundEmailActivityBody(input: {
  name: string;
  to: string;
  subject: string;
  url?: string;
  error?: string;
  failed?: boolean;
}) {
  const who = input.name.trim();
  const email = input.to.trim();
  const subject = input.subject.replace(/[\r\n]+/g, " ").trim();
  const url = input.url?.trim() ?? "";
  const same = who && email && who.toLowerCase() === email.toLowerCase();
  const target = email && who && !same ? `${who} (${email})` : email || who || "recipient";
  if (input.failed) {
    const reason = input.error?.replace(/[\r\n]+/g, " ").trim() ?? "";
    return `Could not email ${target}: ${subject}${reason ? `. ${reason}` : ""}`;
  }
  return `Emailed ${target}: ${subject}${url ? ` — ${url}` : ""}`;
}

export function isMissingEmailDeliveryColumn(error: { message?: string } | null | undefined) {
  const message = (error?.message ?? "").toLowerCase();
  return (
    message.includes("resend_id") ||
    message.includes("email_status") ||
    message.includes("log_job_email_activity")
  );
}
