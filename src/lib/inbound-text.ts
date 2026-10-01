import { imessageEffectLabel, imessageReactionText } from "./imessage.ts";

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

export type InboundAction = "insert" | "edit" | "unsend";

export type InboundText = {
  from: string;
  content: string;
  handle: string;
  mediaUrl: string;
  sentAt: string | null;
  kind: string;
  detail: string;
  action: InboundAction;
  targetHandle: string;
};

type Piece = {
  body: string;
  kind: string;
  detail: string;
  action: InboundAction;
  targetHandle: string;
};

function piece(body: string, extra?: Partial<Piece>): Piece {
  return { body, kind: "text", detail: "", action: "insert", targetHandle: "", ...extra };
}

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

function targetOf(content: Record<string, unknown>) {
  return asRecord(content.target);
}

function reactionBody(content: Record<string, unknown>): Piece {
  const emoji = asString(content.emoji).trim();
  const target = targetOf(content);
  const text = imessageReactionText(emoji, asString(target?.contentPreview));
  return piece(text.body, {
    kind: "reaction",
    detail: text.detail,
    targetHandle: asString(target?.id),
  });
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

function namesOf(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => (typeof item === "string" ? item : asString(asRecord(item)?.id)))
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

function describeContent(content: unknown, fallback: string): Piece | null {
  if (typeof content === "string") return piece(content.trim() || fallback.trim());
  const record = asRecord(content);
  if (!record) {
    const body = fallback.trim();
    return body ? piece(body) : null;
  }
  const type = asString(record.type);
  if (type === "typing") return null;
  if (!type || type === "text") {
    const subject = asString(record.subject).trim();
    const text = asString(record.text).trim() || asString(record.body).trim() || fallback.trim();
    const body = subject && text ? `${subject}\n${text}` : subject || text;
    return body ? piece(body) : null;
  }
  if (type === "markdown") {
    const body = asString(record.markdown).trim() || asString(record.text).trim();
    return body ? piece(body, { kind: "markdown" }) : null;
  }
  if (type === "attachment") {
    return piece(attachmentBody(record), { kind: "attachment", detail: asString(record.mimeType) });
  }
  if (type === "reaction") return reactionBody(record);
  if (type === "contact") return piece(contactBody(record), { kind: "contact" });
  if (type === "richlink") {
    return piece(asString(record.url).trim() || "Shared a link", { kind: "richlink" });
  }
  if (type === "read") return piece("Read a message", { kind: "read" });
  if (type === "effect") {
    const inner = describeContent(record.content, fallback);
    const label = imessageEffectLabel(asString(record.effect));
    if (!inner) return piece(label, { kind: "effect", detail: label });
    return piece(inner.body, { kind: "effect", detail: label });
  }
  if (type === "reply") {
    const inner = describeContent(record.content ?? record.text, fallback);
    const preview = quoted(asString(targetOf(record)?.contentPreview));
    return piece(inner?.body || fallback.trim() || "Reply", {
      kind: "reply",
      detail: preview ? `Reply to ${preview}` : "Reply",
      targetHandle: asString(targetOf(record)?.id),
    });
  }
  if (type === "edit") {
    const inner = describeContent(record.content ?? record.text, fallback);
    return piece(inner?.body || "Edited a message", {
      kind: "edit",
      detail: "Edited",
      action: "edit",
      targetHandle: asString(targetOf(record)?.id),
    });
  }
  if (type === "unsend") {
    return piece("Message unsent", {
      kind: "unsend",
      detail: "Unsent",
      action: "unsend",
      targetHandle: asString(targetOf(record)?.id) || asString(record.id),
    });
  }
  if (type === "poll") {
    const options = Array.isArray(record.options)
      ? record.options.map((item) => asString(asRecord(item)?.title).trim()).filter(Boolean)
      : [];
    return piece(asString(record.title).trim() || "Poll", {
      kind: "poll",
      detail: options.join(" · "),
    });
  }
  if (type === "poll_option") {
    return piece(asString(record.title).trim() || "Voted", { kind: "poll", detail: "Vote" });
  }
  if (type === "rename") {
    const name = asString(record.displayName).trim();
    return piece(name ? `Renamed the chat to ${name}` : "Renamed the chat", { kind: "rename", detail: name });
  }
  if (type === "addMember") {
    const names = namesOf(record.members);
    return piece(names ? `Added ${names}` : "Added someone to the chat", { kind: "membership" });
  }
  if (type === "removeMember") {
    const names = namesOf(record.members);
    return piece(names ? `Removed ${names}` : "Removed someone from the chat", { kind: "membership" });
  }
  if (type === "leaveSpace") return piece("Left the conversation", { kind: "membership" });
  if (type === "avatar") return piece("Changed the group photo", { kind: "avatar" });
  const text = asString(record.text).trim() || asString(record.body).trim();
  if (text) return piece(text, { kind: type || "text" });
  if (type) return piece(type, { kind: type });
  return null;
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
  const described = describeContent(content, asString(raw.text) || asString(message?.text));
  const mediaUrl = mediaFrom(raw, message);
  if (!described && !mediaUrl) return null;
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
  const row = described ?? piece("(photo or attachment)");
  return {
    from,
    content: row.body || "(photo or attachment)",
    handle,
    mediaUrl,
    sentAt: sentAt || null,
    kind: row.kind,
    detail: row.detail,
    action: row.action,
    targetHandle: row.targetHandle,
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

const EMPTY_INBOUND: InboundText = {
  from: "",
  content: "",
  handle: "",
  mediaUrl: "",
  sentAt: null,
  kind: "text",
  detail: "",
  action: "insert",
  targetHandle: "",
};

export function inboundTextFields(raw: Record<string, unknown>): InboundText {
  return inboundMessages(raw)[0] ?? EMPTY_INBOUND;
}
