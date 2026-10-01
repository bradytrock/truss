function asRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nestedMessage(body: Record<string, unknown>) {
  return asRecord(body.message);
}

function senderId(value: unknown) {
  const record = asRecord(value);
  if (!record) return "";
  return asString(record.id) || asString(record.address) || asString(record.phone);
}

function httpUrl(value: string) {
  return /^https?:\/\//i.test(value.trim()) ? value.trim() : "";
}

/** Spectrum Stable delivers one event, `messages`. Older payloads used `message.received`. */
const ACCEPTED_EVENTS = new Set(["messages", "message.received"]);

const TAPBACKS: Record<string, string> = {
  "❤️": "Loved",
  "❤": "Loved",
  "👍": "Liked",
  "👎": "Disliked",
  "😂": "Laughed at",
  "‼️": "Emphasized",
  "❗": "Emphasized",
  "❓": "Questioned",
};

export type InboundText = {
  from: string;
  content: string;
  handle: string;
  mediaUrl: string;
  sentAt: string | null;
};

function eventName(body: Record<string, unknown>) {
  return (asString(body.event) || asString(body.type)).toLowerCase();
}

/** Photon deliveries are inbound. Skip echoes marked outbound or from this line. */
export function inboundSkipReason(body: Record<string, unknown>) {
  if (body.is_outbound === true || body.isFromMe === true) return "outbound";
  const direction = asString(body.direction).toLowerCase();
  if (direction === "outbound") return "outbound";
  const message = nestedMessage(body);
  if (message) {
    if (message.is_outbound === true || message.isFromMe === true) return "outbound";
    if (asString(message.direction).toLowerCase() === "outbound") return "outbound";
  }
  const event = eventName(body);
  if (event && !ACCEPTED_EVENTS.has(event)) return "ignored_event";
  return null;
}

function quoted(value: string) {
  const text = value.trim();
  return text ? `“${text}”` : "";
}

function reactionBody(content: Record<string, unknown>) {
  const emoji = asString(content.emoji).trim();
  const target = asRecord(content.target);
  const preview = quoted(asString(target?.contentPreview));
  const verb = TAPBACKS[emoji] ?? "";
  if (verb && preview) return `${verb} ${preview}`;
  if (verb) return `${verb} a message`;
  if (emoji && preview) return `Reacted ${emoji} to ${preview}`;
  if (emoji) return `Reacted ${emoji}`;
  return "Reacted to a message";
}

function attachmentBody(content: Record<string, unknown>) {
  const mime = asString(content.mimeType).toLowerCase();
  const name = asString(content.name).trim();
  const kind = mime.startsWith("image/")
    ? "Photo"
    : mime.startsWith("audio/")
      ? "Voice message"
      : mime.startsWith("video/")
        ? "Video"
        : "File";
  return name ? `${kind} · ${name}` : kind;
}

function contactBody(content: Record<string, unknown>) {
  const name = asRecord(content.name);
  const formatted =
    asString(name?.formatted).trim() ||
    [asString(name?.first), asString(name?.last)].filter((part) => part.trim()).join(" ");
  const phones = Array.isArray(content.phones) ? content.phones : [];
  const phone = asString(asRecord(phones[0])?.value).trim();
  const who = formatted || phone;
  return who ? `Shared a contact · ${who}` : "Shared a contact";
}

function describeContent(content: unknown, fallback: string) {
  if (typeof content === "string") return content.trim() || fallback.trim();
  const record = asRecord(content);
  if (!record) return fallback.trim();
  const type = asString(record.type);
  if (!type || type === "text") return asString(record.text).trim() || asString(record.body).trim() || fallback.trim();
  if (type === "markdown") return asString(record.markdown).trim() || asString(record.text).trim();
  if (type === "attachment") return attachmentBody(record);
  if (type === "reaction") return reactionBody(record);
  if (type === "contact") return contactBody(record);
  if (type === "richlink") return asString(record.url).trim() || "Shared a link";
  if (type === "typing") return "";
  if (type === "read") return "Read a message";
  return asString(record.text).trim() || asString(record.body).trim();
}

function mediaFrom(raw: Record<string, unknown>, message: Record<string, unknown> | null) {
  return httpUrl(asString(message?.media_url)) || httpUrl(asString(raw.media_url));
}

function oneMessage(
  raw: Record<string, unknown>,
  message: Record<string, unknown> | null,
  content: unknown,
  fallbackFrom: string,
  fallbackHandle: string,
  fallbackSentAt: string | null,
): InboundText | null {
  const body = describeContent(content, asString(raw.text) || asString(message?.text));
  const mediaUrl = mediaFrom(raw, message);
  if (!body && !mediaUrl) return null;
  const from =
    senderId(message?.sender) ||
    senderId(raw.sender) ||
    asString(raw.from_number) ||
    asString(message?.from_number) ||
    asString(raw.number) ||
    asString(message?.number) ||
    fallbackFrom;
  const handle =
    asString(message?.id) ||
    asString(message?.guid) ||
    asString(raw.message_handle) ||
    asString(raw.id) ||
    fallbackHandle;
  const sentAt =
    asString(message?.timestamp) ||
    asString(raw.date_sent) ||
    asString(raw.occurredAt) ||
    asString(message?.date_sent) ||
    asString(message?.occurredAt) ||
    fallbackSentAt ||
    null;
  return {
    from,
    content: body || "(photo or attachment)",
    handle,
    mediaUrl,
    sentAt: sentAt || null,
  };
}

/** Every inbound row in one Photon delivery. Albums become one row per photo. */
export function inboundMessages(raw: Record<string, unknown>): InboundText[] {
  const message = nestedMessage(raw);
  const content = message?.content ?? raw.content;
  const record = asRecord(content);
  if (record && asString(record.type) === "group" && Array.isArray(record.items)) {
    const parent = oneMessage(raw, message, null, "", "", null);
    const items = record.items.flatMap((item, index) => {
      const row = asRecord(item);
      if (!row) return [];
      const parsed = oneMessage(
        raw,
        row,
        row.content,
        parent?.from ?? "",
        parent?.handle ? `${parent.handle}:${index}` : "",
        parent?.sentAt ?? null,
      );
      return parsed ? [parsed] : [];
    });
    if (items.length > 0) return items;
  }
  const parsed = oneMessage(raw, message, content, "", "", null);
  return parsed ? [parsed] : [];
}

export function inboundTextFields(raw: Record<string, unknown>): InboundText {
  return (
    inboundMessages(raw)[0] ?? {
      from: "",
      content: "",
      handle: "",
      mediaUrl: "",
      sentAt: null,
    }
  );
}
