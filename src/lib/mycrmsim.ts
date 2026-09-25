/** Custom-workspace send endpoint. location_id in the body picks the SIM. */
export const MYCRMSIM_SEND_URL =
  "https://r6bszuuso6.execute-api.ap-southeast-2.amazonaws.com/prod/webhook";

export const MYCRMSIM_CHANNELS = ["sms", "imessage", "whatsapp", "rcs"] as const;
export type MycrmsimChannel = (typeof MYCRMSIM_CHANNELS)[number];

export const MYCRMSIM_CHANNEL_LABELS: Record<MycrmsimChannel, string> = {
  sms: "SMS",
  imessage: "iMessage",
  whatsapp: "WhatsApp",
  rcs: "RCS",
};

export type TextSendResult =
  | { ok: true; mocked: boolean; to: string; handle: string }
  | { ok: false; mocked: false; error: string };

export type MycrmsimEvent =
  | { kind: "ignore" }
  | {
      kind: "message";
      locationId: string;
      phone: string;
      message: string;
      messageId: string;
      isMe: boolean;
      mediaUrl: string;
    }
  | {
      kind: "status";
      locationId: string;
      messageId: string;
      status: string;
      phone: string;
    }
  | {
      kind: "call";
      locationId: string;
      phone: string;
      message: string;
      isMe: boolean;
    };

export function isMycrmsimChannel(value: string): value is MycrmsimChannel {
  return (MYCRMSIM_CHANNELS as readonly string[]).includes(value);
}

export function normalizeMycrmsimChannel(value: string | null | undefined): MycrmsimChannel {
  const raw = (value ?? "").trim().toLowerCase();
  return isMycrmsimChannel(raw) ? raw : "sms";
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstMedia(value: unknown) {
  if (!Array.isArray(value)) return "";
  const found = value.find((item) => typeof item === "string" && item.trim());
  return typeof found === "string" ? found.trim() : "";
}

function isMeFlag(body: Record<string, unknown>) {
  return body.isMe === true || body.is_me === true;
}

/** Turn a myCRMSIM workspace webhook body into a message, status, or call. */
export function parseMycrmsimWebhook(raw: unknown): MycrmsimEvent {
  const body = asRecord(raw);
  if (!body) return { kind: "ignore" };

  const type = asString(body.type || body.event).toUpperCase().replace(/[\s_]/g, "-");
  const locationId = asString(body.location_id || body.locationId);
  const phone = asString(body.phone || body.from || body.number);
  const message = asString(body.message || body.content || body.body);
  const messageId = asString(body.message_id || body.messageId);
  const status = asString(body.status).toUpperCase();
  const mediaUrl = firstMedia(body.attachments) || asString(body.media_url);

  const looksLikeStatus =
    type === "STATUS" ||
    type === "STATUS-UPDATE" ||
    type.startsWith("STATUS-") ||
    (Boolean(status) && Boolean(messageId) && type !== "MESSAGE" && type !== "CALL");

  if (looksLikeStatus) {
    if (!locationId && !messageId) return { kind: "ignore" };
    return { kind: "status", locationId, messageId, status: status || "SENT", phone };
  }

  if (type === "CALL" || type.endsWith("-CALL")) {
    if (!locationId && !phone) return { kind: "ignore" };
    return { kind: "call", locationId, phone, message, isMe: isMeFlag(body) };
  }

  if (type === "MESSAGE" || (locationId && (phone || message))) {
    return {
      kind: "message",
      locationId,
      phone,
      message,
      messageId,
      isMe: isMeFlag(body),
      mediaUrl,
    };
  }

  return { kind: "ignore" };
}

export function mycrmsimSendBody(input: {
  locationId: string;
  userId: string;
  phone: string;
  message: string;
  messageId: string;
  channel: MycrmsimChannel;
  attachments?: string[];
}) {
  const attachments = (input.attachments ?? []).map((item) => item.trim()).filter(Boolean);
  return {
    location_id: input.locationId,
    user_id: input.userId || "truss",
    phone: input.phone,
    message: input.message,
    message_id: input.messageId,
    channel: input.channel,
    ...(attachments.length ? { attachments } : {}),
  };
}

