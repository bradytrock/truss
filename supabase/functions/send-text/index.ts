/**
 * Reads SENDBLUE_* from Supabase Edge Function secrets (Project Settings → Edge Functions → Secrets)
 * and sends an iMessage / SMS via Sendblue. The Next.js website cannot see those secrets otherwise.
 */
const SENDBLUE_SEND_URL = "https://api.sendblue.co/api/send-message";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function toE164(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) {
    const rest = digitsOnly(trimmed.slice(1));
    return rest ? `+${rest}` : "";
  }
  const digits = digitsOnly(trimmed);
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return "";
}

function sendblueCredentials() {
  const keyId = (
    Deno.env.get("SENDBLUE_API_KEY_ID") ||
    Deno.env.get("SENDBLUE_API_KEY") ||
    ""
  ).trim();
  const secret = (
    Deno.env.get("SENDBLUE_API_SECRET_KEY") ||
    Deno.env.get("SENDBLUE_API_SECRET") ||
    ""
  ).trim();
  const from = toE164(Deno.env.get("SENDBLUE_FROM_NUMBER") || "");
  return { keyId, secret, from };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const { keyId, secret, from } = sendblueCredentials();
  const configured = Boolean(keyId && secret && from);
  const fromNumber = from ? `ending ${from.slice(-4)}` : "";

  if (request.method === "GET") {
    return json({ configured, fromNumber });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Could not read that request." }, 400);
  }

  const to = toE164(typeof body.to === "string" ? body.to : "");
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!to) return json({ error: "That phone number is not valid." }, 400);
  if (!content) return json({ error: "Write a message before sending." }, 400);

  if (!configured) {
    return json({ ok: true, mocked: true, to, configured: false });
  }

  const response = await fetch(SENDBLUE_SEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "sb-api-key-id": keyId,
      "sb-api-secret-key": secret,
    },
    body: JSON.stringify({
      from_number: from,
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
    const error =
      (typeof payload.error_message === "string" && payload.error_message) ||
      (typeof payload.message === "string" && payload.message) ||
      `Sendblue returned ${response.status}.`;
    return json({ ok: false, error }, 502);
  }

  const status = typeof payload.status === "string" ? payload.status : "";
  if (status === "ERROR") {
    const error =
      (typeof payload.error_message === "string" && payload.error_message) ||
      "Sendblue could not send that text.";
    return json({ ok: false, error }, 502);
  }

  return json({
    ok: true,
    mocked: false,
    configured: true,
    to,
    handle: typeof payload.message_handle === "string" ? payload.message_handle : "",
  });
});
