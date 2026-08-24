import { toE164 } from "@/lib/phone";

const SENDBLUE_SEND_URL = "https://api.sendblue.co/api/send-message";

export function sendblueApiKeyId() {
  return process.env.SENDBLUE_API_KEY_ID?.trim() || process.env.SENDBLUE_API_KEY?.trim() || "";
}

export function sendblueApiSecret() {
  return (
    process.env.SENDBLUE_API_SECRET_KEY?.trim() ||
    process.env.SENDBLUE_API_SECRET?.trim() ||
    ""
  );
}

export function sendblueFromNumber() {
  return toE164(process.env.SENDBLUE_FROM_NUMBER?.trim() || "");
}

export function isSendblueConfigured() {
  return Boolean(sendblueApiKeyId() && sendblueApiSecret() && sendblueFromNumber());
}

export function sendblueStatus() {
  const from = sendblueFromNumber();
  return {
    configured: isSendblueConfigured(),
    fromNumber: from ? `ending ${from.slice(-4)}` : "",
  };
}

export async function sendblueText(input: { to: string; content: string }) {
  const to = toE164(input.to);
  const content = input.content.trim();
  if (!to) {
    return { ok: false as const, mocked: false, error: "That phone number is not valid." };
  }
  if (!content) {
    return { ok: false as const, mocked: false, error: "Write a message before sending." };
  }

  if (!isSendblueConfigured()) {
    return {
      ok: true as const,
      mocked: true,
      to,
      handle: `mock_${Date.now()}`,
    };
  }

  const response = await fetch(SENDBLUE_SEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "sb-api-key-id": sendblueApiKeyId(),
      "sb-api-secret-key": sendblueApiSecret(),
    },
    body: JSON.stringify({
      from_number: sendblueFromNumber(),
      number: to,
      content,
    }),
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message =
      (typeof payload.error_message === "string" && payload.error_message) ||
      (typeof payload.message === "string" && payload.message) ||
      `Sendblue returned ${response.status}.`;
    return { ok: false as const, mocked: false, error: message };
  }

  const status = typeof payload.status === "string" ? payload.status : "";
  if (status === "ERROR") {
    const message =
      (typeof payload.error_message === "string" && payload.error_message) ||
      "Sendblue could not send that text.";
    return { ok: false as const, mocked: false, error: message };
  }

  return {
    ok: true as const,
    mocked: false,
    to,
    handle: typeof payload.message_handle === "string" ? payload.message_handle : "",
  };
}
