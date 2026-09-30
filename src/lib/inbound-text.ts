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

function textContent(value: unknown) {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  if (!record) return "";
  return asString(record.text) || asString(record.body);
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
  const type = asString(body.type) || asString(body.event);
  if (type && type !== "message.received") return "ignored_event";
  return null;
}

export function inboundTextFields(raw: Record<string, unknown>) {
  const message = nestedMessage(raw);
  const from =
    senderId(raw.sender) ||
    senderId(message?.sender) ||
    asString(raw.from_number) ||
    asString(message?.from_number) ||
    asString(raw.number) ||
    asString(message?.number);
  const content =
    textContent(raw.content) ||
    textContent(message?.content) ||
    asString(raw.text) ||
    asString(message?.text);
  const handle =
    asString(message?.id) ||
    asString(message?.guid) ||
    asString(raw.message_handle) ||
    asString(raw.id);
  const mediaUrl = asString(raw.media_url) || asString(message?.media_url);
  const sentAt =
    asString(raw.date_sent) ||
    asString(raw.occurredAt) ||
    asString(message?.date_sent) ||
    asString(message?.occurredAt) ||
    null;
  return { from, content, handle, mediaUrl, sentAt };
}
