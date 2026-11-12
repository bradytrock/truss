import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SECONDS = 5 * 60;

function secretBytes(secret: string) {
  const trimmed = secret.trim();
  const encoded = trimmed.startsWith("whsec_") ? trimmed.slice("whsec_".length) : trimmed;
  try {
    const decoded = Buffer.from(encoded, "base64");
    if (decoded.length > 0) return decoded;
  } catch {
    // Fall through to the raw secret bytes.
  }
  return Buffer.from(trimmed);
}

function signaturesMatch(expected: string, candidate: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(candidate);
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

/** Svix signature check used by Resend webhooks. */
export function verifyResendWebhook(input: {
  payload: string;
  secret: string;
  id: string;
  timestamp: string;
  signature: string;
  nowMs?: number;
}) {
  const secret = input.secret.trim();
  const id = input.id.trim();
  const timestamp = input.timestamp.trim();
  const signature = input.signature.trim();
  if (!secret || !id || !timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;
  const now = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(now - seconds) > TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secretBytes(secret))
    .update(`${id}.${timestamp}.${input.payload}`)
    .digest("base64");
  return signature.split(" ").some((part) => {
    const value = part.trim().replace(/^v1,/, "");
    return signaturesMatch(expected, value);
  });
}
