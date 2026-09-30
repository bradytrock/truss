import { createHmac, timingSafeEqual } from "node:crypto";

/** Reject deliveries older than this. Spectrum signs `X-Spectrum-Timestamp` as UNIX seconds. */
export const SPECTRUM_SIGNATURE_TOLERANCE_SEC = 5 * 60;

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function last10(value: string) {
  return digitsOnly(value).slice(-10);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function signaturesMatch(expected: string, received: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifySpectrumSignature(input: {
  secret: string;
  timestamp: string;
  signature: string;
  rawBody: string;
  nowMs?: number;
}): { ok: true } | { ok: false; status: number; error: string } {
  const secret = input.secret.trim();
  const timestamp = input.timestamp.trim();
  const signature = input.signature.trim();
  if (!secret || !timestamp || !signature) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }
  const stamped = Number(timestamp);
  if (!Number.isFinite(stamped)) {
    return { ok: false, status: 400, error: "Stale webhook." };
  }
  const now = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(now - stamped) > SPECTRUM_SIGNATURE_TOLERANCE_SEC) {
    return { ok: false, status: 400, error: "Stale webhook." };
  }
  const expected =
    "v0=" + createHmac("sha256", secret).update(`v0:${timestamp}:${input.rawBody}`).digest("hex");
  if (!signaturesMatch(expected, signature)) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }
  return { ok: true };
}

export function authorizeInboundWebhook(input: {
  secret: string;
  token: string;
  headerToken: string;
  queryToken: string;
  timestamp: string;
  signature: string;
  rawBody: string;
  nowMs?: number;
}): { ok: true } | { ok: false; status: number; error: string } {
  const token = input.token.trim();
  if (token) {
    const header = input.headerToken.trim();
    const query = input.queryToken.trim();
    if (header !== token && query !== token) {
      return { ok: false, status: 401, error: "Unauthorized." };
    }
  }
  const secret = input.secret.trim();
  if (!secret) return { ok: true };
  return verifySpectrumSignature({
    secret,
    timestamp: input.timestamp,
    signature: input.signature,
    rawBody: input.rawBody,
    nowMs: input.nowMs,
  });
}

export type ParsedInboundText = {
  skip: boolean;
  reason?: string;
  from: string;
  body: string;
  handle: string;
  mediaUrl: string;
  sentAt: string | null;
};

const SKIP: ParsedInboundText = {
  skip: true,
  from: "",
  body: "",
  handle: "",
  mediaUrl: "",
  sentAt: null,
};

function skipped(reason: string): ParsedInboundText {
  return { ...SKIP, reason };
}

function isSpectrumPayload(raw: Record<string, unknown>) {
  if (raw.event === "messages") return true;
  const message = raw.message;
  if (!isRecord(message)) return false;
  if (isRecord(message.sender)) return true;
  return isRecord(message.content) && typeof message.content.type === "string";
}

function spectrumBody(content: Record<string, unknown>) {
  const type = asString(content.type);
  if (type === "text") return { body: asString(content.text), keep: true };
  if (type === "attachment") return { body: "(photo or attachment)", keep: true };
  if (typeof content.text === "string" && content.text.trim()) {
    return { body: content.text, keep: true };
  }
  return { body: "", keep: false };
}

function parseSpectrum(raw: Record<string, unknown>): ParsedInboundText {
  if (asString(raw.event) && raw.event !== "messages") return skipped("event");
  const message = isRecord(raw.message) ? raw.message : raw;
  if (asString(message.direction) === "outbound") return skipped("outbound");
  const space = isRecord(raw.space) ? raw.space : isRecord(message.space) ? message.space : {};
  if (asString(space.type) === "group") return skipped("group");
  const content = isRecord(message.content) ? message.content : {};
  const rendered = spectrumBody(content);
  if (!rendered.keep) return skipped("unsupported");
  const sender = isRecord(message.sender) ? message.sender : {};
  const from = asString(sender.id);
  const body = rendered.body.trim();
  if (!from || !body) return skipped("empty");
  const sentAt = asString(message.timestamp) || null;
  return {
    skip: false,
    from,
    body,
    handle: asString(message.id),
    mediaUrl: "",
    sentAt,
  };
}

function flattenLegacy(body: Record<string, unknown>) {
  const nested = body.message;
  if (isRecord(nested) && !isSpectrumPayload({ message: nested })) {
    return { ...body, ...nested };
  }
  return body;
}

function parseLegacy(raw: Record<string, unknown>, ourFromNumber: string): ParsedInboundText {
  const body = flattenLegacy(raw);
  if (body.is_outbound === true) return skipped("outbound");
  const from = asString(body.from_number) || asString(body.number);
  const ours = last10(ourFromNumber);
  const fromKey = last10(from);
  if (ours && fromKey && ours === fromKey) return skipped("outbound");
  return {
    skip: false,
    from,
    body: asString(body.content),
    handle: asString(body.message_handle),
    mediaUrl: asString(body.media_url),
    sentAt: asString(body.date_sent) || null,
  };
}

/** Spectrum inbound deliveries, plus the older Sendblue shape during cutover. */
export function parseInboundText(raw: unknown, ourFromNumber = ""): ParsedInboundText {
  if (!isRecord(raw)) return skipped("bad_payload");
  if (isSpectrumPayload(raw)) return parseSpectrum(raw);
  return parseLegacy(raw, ourFromNumber);
}
