/**
 * Receive webhook for Photon inbound texts.
 * Same ingest path as /api/messages/inbound.
 * Field parsing matches src/lib/inbound-text.ts.
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-token",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}

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

function inboundSkipReason(body: Record<string, unknown>) {
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

function inboundTextFields(raw: Record<string, unknown>) {
  const message = nestedMessage(raw);
  return {
    from:
      senderId(raw.sender) ||
      senderId(message?.sender) ||
      asString(raw.from_number) ||
      asString(message?.from_number) ||
      asString(raw.number) ||
      asString(message?.number),
    content:
      textContent(raw.content) ||
      textContent(message?.content) ||
      asString(raw.text) ||
      asString(message?.text),
    handle:
      asString(message?.id) ||
      asString(message?.guid) ||
      asString(raw.message_handle) ||
      asString(raw.id),
    mediaUrl: asString(raw.media_url) || asString(message?.media_url),
    sentAt:
      asString(raw.date_sent) ||
      asString(raw.occurredAt) ||
      asString(message?.date_sent) ||
      asString(message?.occurredAt) ||
      null,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (request.method === "GET") {
    return json({ ok: true });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const expected = (Deno.env.get("MESSAGES_WEBHOOK_TOKEN") ?? "").trim();
  if (expected) {
    const url = new URL(request.url);
    const header = request.headers.get("x-webhook-token")?.trim() || "";
    const query = url.searchParams.get("token")?.trim() || "";
    if (header !== expected && query !== expected) {
      return json({ error: "Unauthorized." }, 401);
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Missing Supabase service credentials." }, 500);
  }

  let raw: Record<string, unknown> = {};
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: true, skipped: true });
  }

  const skip = inboundSkipReason(raw);
  if (skip) {
    return json({ ok: true, skipped: true, reason: skip });
  }

  const fields = inboundTextFields(raw);
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/ingest_inbound_text`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_from: fields.from,
      p_body: fields.content,
      p_handle: fields.handle,
      p_media_url: fields.mediaUrl,
      p_sent_at: fields.sentAt,
    }),
  });

  const payload = await response.json().catch(() => ({ ok: true }));
  return json(payload, response.ok ? 200 : 500);
});
