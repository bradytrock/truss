/**
 * Optional Edge Function sender for myCRMSIM.
 * The Next.js app sends from Settings → Texts (per company). This function is the
 * host-level fallback when MYCRMSIM_LOCATION_ID is set as an Edge Function secret.
 */
const MYCRMSIM_SEND_URL =
  "https://r6bszuuso6.execute-api.ap-southeast-2.amazonaws.com/prod/webhook";

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

const CHANNELS = ["sms", "imessage", "whatsapp", "rcs"];

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const locationId = (Deno.env.get("MYCRMSIM_LOCATION_ID") ?? "").trim();
  const channelRaw = (Deno.env.get("MYCRMSIM_CHANNEL") ?? "sms").trim().toLowerCase();
  const channel = CHANNELS.includes(channelRaw) ? channelRaw : "sms";
  const configured = Boolean(locationId);

  if (request.method === "GET") {
    return json({ configured, channel });
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
  const userId = typeof body.userId === "string" && body.userId.trim() ? body.userId.trim() : "truss";
  if (!to) return json({ error: "That phone number is not valid." }, 400);
  if (!content) return json({ error: "Write a message before sending." }, 400);

  if (!configured) {
    return json({ ok: true, mocked: true, to, configured: false, handle: `mock_${Date.now()}` });
  }

  const messageId = crypto.randomUUID();
  const response = await fetch(MYCRMSIM_SEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location_id: locationId,
      user_id: userId,
      phone: to,
      message: content,
      message_id: messageId,
      channel,
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
      (typeof payload.error === "string" && payload.error) ||
      (typeof payload.message === "string" && payload.message) ||
      `myCRMSIM returned ${response.status}.`;
    return json({ ok: false, error }, 502);
  }

  return json({
    ok: true,
    mocked: false,
    configured: true,
    to,
    handle: messageId,
  });
});
