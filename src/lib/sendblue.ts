import { toE164 } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";

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

export function isSendblueConfiguredLocally() {
  return Boolean(sendblueApiKeyId() && sendblueApiSecret() && sendblueFromNumber());
}

/** @deprecated Use sendblueStatus() — local env is not the only place keys can live. */
export function isSendblueConfigured() {
  return isSendblueConfiguredLocally();
}

type SendblueStatus = { configured: boolean; fromNumber: string };

async function sendblueFunctionRequest(input: {
  method: "GET" | "POST";
  body?: Record<string, string>;
}) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;

  const url = `${getSupabaseUrl()}/functions/v1/send-text`;
  const response = await fetch(url, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: getSupabaseKey(),
      "Content-Type": "application/json",
    },
    body: input.method === "POST" ? JSON.stringify(input.body ?? {}) : undefined,
  });
  return response;
}

export async function sendblueStatus(): Promise<SendblueStatus> {
  if (isSendblueConfiguredLocally()) {
    const from = sendblueFromNumber();
    return {
      configured: true,
      fromNumber: from ? `ending ${from.slice(-4)}` : "",
    };
  }
  try {
    const response = await sendblueFunctionRequest({ method: "GET" });
    if (!response || !response.ok) {
      return { configured: false, fromNumber: "" };
    }
    const payload = (await response.json()) as SendblueStatus;
    return {
      configured: Boolean(payload.configured),
      fromNumber: typeof payload.fromNumber === "string" ? payload.fromNumber : "",
    };
  } catch {
    return { configured: false, fromNumber: "" };
  }
}

async function sendblueTextLocal(to: string, content: string) {
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

async function sendblueTextViaFunction(to: string, content: string) {
  const response = await sendblueFunctionRequest({
    method: "POST",
    body: { to, content },
  });
  if (!response) {
    return {
      ok: false as const,
      mocked: false,
      error: "Sign in again, then retry the text.",
    };
  }
  if (response.status === 404) {
    return {
      ok: true as const,
      mocked: true,
      to,
      handle: `mock_${Date.now()}`,
    };
  }
  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  if (!response.ok || payload.ok === false) {
    const message =
      (typeof payload.error === "string" && payload.error) ||
      (typeof payload.error_message === "string" && payload.error_message) ||
      "Sendblue could not send that text.";
    return { ok: false as const, mocked: false, error: message };
  }
  return {
    ok: true as const,
    mocked: Boolean(payload.mocked),
    to,
    handle: typeof payload.handle === "string" ? payload.handle : "",
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

  if (isSendblueConfiguredLocally()) {
    return sendblueTextLocal(to, content);
  }

  try {
    return await sendblueTextViaFunction(to, content);
  } catch {
    return {
      ok: true as const,
      mocked: true,
      to,
      handle: `mock_${Date.now()}`,
    };
  }
}
