import { digitsOnly, toE164 } from "@/lib/phone";

export const MYCRMSIM_SEND_URL =
  "https://r6bszuuso6.execute-api.ap-southeast-2.amazonaws.com/prod/webhook";

export const MYCRMSIM_CHANNELS = ["sms", "imessage", "whatsapp", "rcs"] as const;
export type MycrmsimChannel = (typeof MYCRMSIM_CHANNELS)[number];

function env(name: string) {
  return process.env[name]?.trim() || "";
}

export function mycrmsimLocationId() {
  return env("MYCRMSIM_LOCATION_ID");
}

export function mycrmsimUserId() {
  return env("MYCRMSIM_USER_ID") || "truss";
}

export function mycrmsimFromNumber() {
  return toE164(env("MYCRMSIM_FROM_NUMBER"));
}

export function mycrmsimSendUrl() {
  return env("MYCRMSIM_SEND_URL") || MYCRMSIM_SEND_URL;
}

export function mycrmsimChannel(): MycrmsimChannel {
  const raw = env("MYCRMSIM_CHANNEL").toLowerCase();
  return MYCRMSIM_CHANNELS.includes(raw as MycrmsimChannel) ? (raw as MycrmsimChannel) : "sms";
}

export function isMycrmsimConfigured() {
  return Boolean(mycrmsimLocationId());
}

export function mycrmsimFromLabel() {
  const from = mycrmsimFromNumber();
  return from ? `ending ${from.slice(-4)}` : "";
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function firstAttachmentUrl(value: unknown) {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  if (!Array.isArray(value)) return "";
  for (const item of value) {
    if (typeof item === "string" && /^https?:\/\//i.test(item)) return item;
    if (item && typeof item === "object") {
      const row = item as Record<string, unknown>;
      const url = asString(row.url) || asString(row.src) || asString(row.href);
      if (/^https?:\/\//i.test(url)) return url;
    }
  }
  return "";
}

export function normalizeWebhookBody(raw: Record<string, unknown>) {
  const nested = raw.message;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...raw, ...(nested as Record<string, unknown>) };
  }
  return raw;
}

export type TextWebhookEvent =
  | {
      kind: "inbound";
      from: string;
      body: string;
      handle: string;
      mediaUrl: string;
      sentAt: string | null;
    }
  | { kind: "status" }
  | { kind: "call" }
  | { kind: "outbound-echo" }
  | { kind: "skip"; reason: string };

export function parseTextWebhookPayload(
  raw: Record<string, unknown>,
  opts?: { locationId?: string; fromNumber?: string },
): TextWebhookEvent {
  const body = normalizeWebhookBody(raw);
  const type = asString(body.type).toUpperCase().replace(/_/g, "-");
  if (type === "CALL") return { kind: "call" };
  if (type === "STATUS" || type === "STATUS-UPDATE") return { kind: "status" };
  const status = asString(body.status).toUpperCase();
  if (status === "SENT" || status === "DELIVERED" || status === "FAILED") return { kind: "status" };
  if (body.isMe === true || body.is_me === true || body.is_outbound === true) {
    return { kind: "outbound-echo" };
  }

  const locationId = asString(body.location_id);
  const expectedLocation = opts?.locationId ?? mycrmsimLocationId();
  if (expectedLocation && locationId && locationId !== expectedLocation) {
    return { kind: "skip", reason: "location" };
  }

  const from =
    asString(body.phone) ||
    asString(body.from_number) ||
    asString(body.number) ||
    asString(body.from);
  const ours = last10(opts?.fromNumber ?? mycrmsimFromNumber());
  const fromKey = last10(from);
  if (ours && fromKey && ours === fromKey) return { kind: "outbound-echo" };

  const text =
    (typeof raw.message === "string" ? raw.message : "") ||
    asString(body.message) ||
    asString(body.content) ||
    asString(body.body);
  const mediaUrl = firstAttachmentUrl(body.attachments) || asString(body.media_url);
  if (!from) return { kind: "skip", reason: "no_phone" };
  if (!text.trim() && !mediaUrl) return { kind: "skip", reason: "empty" };

  return {
    kind: "inbound",
    from,
    body: text.trim() || (mediaUrl ? "(photo or attachment)" : ""),
    handle: asString(body.message_id) || asString(body.message_handle) || asString(body.id),
    mediaUrl,
    sentAt: asString(body.date_sent) || asString(body.created_at) || asString(body.timestamp) || null,
  };
}

function last10(value: string) {
  return digitsOnly(value).slice(-10);
}

export async function mycrmsimText(input: {
  to: string;
  content: string;
  userId?: string;
  attachments?: string[];
}) {
  const to = toE164(input.to);
  const content = input.content.trim();
  const locationId = mycrmsimLocationId();
  if (!to) return { ok: false as const, mocked: false, error: "That phone number is not valid." };
  if (!content) return { ok: false as const, mocked: false, error: "Write a message before sending." };
  if (!locationId) {
    return { ok: false as const, mocked: false, error: "myCRMSIM is not connected (missing location_id)." };
  }

  const handle = crypto.randomUUID();
  const payload: Record<string, unknown> = {
    location_id: locationId,
    user_id: input.userId?.trim() || mycrmsimUserId(),
    phone: to,
    message: content,
    message_id: handle,
    channel: mycrmsimChannel(),
  };
  const attachments = (input.attachments ?? []).filter((url) => /^https?:\/\//i.test(url));
  if (attachments.length > 0) payload.attachments = attachments;

  const response = await fetch(mycrmsimSendUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (!response.ok) {
    const message =
      asString(body.error) ||
      asString(body.error_message) ||
      asString(body.message) ||
      `myCRMSIM returned ${response.status}.`;
    return { ok: false as const, mocked: false, error: message };
  }

  return {
    ok: true as const,
    mocked: false,
    to,
    handle: asString(body.message_id) || handle,
  };
}
