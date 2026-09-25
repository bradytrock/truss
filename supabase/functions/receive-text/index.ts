/**
 * Receive webhook for myCRMSIM (and leftover Sendblue) inbound texts.
 * Same ingest path as /api/messages/inbound.
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-token",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function last10(value: string) {
  return digitsOnly(value).slice(-10);
}

function firstAttachmentUrl(value: unknown) {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  if (!Array.isArray(value)) return "";
  for (const item of value) {
    if (typeof item === "string" && /^https?:\/\//i.test(item)) return item;
  }
  return "";
}

function parseEvent(raw: Record<string, unknown>) {
  const nested = raw.message;
  const body =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? { ...raw, ...(nested as Record<string, unknown>) }
      : raw;
  const type = asString(body.type).toUpperCase().replace(/_/g, "-");
  if (type === "CALL") return { kind: "call" as const };
  if (type === "STATUS" || type === "STATUS-UPDATE") return { kind: "status" as const };
  if (body.isMe === true || body.is_me === true || body.is_outbound === true) {
    return { kind: "outbound-echo" as const };
  }
  const expectedLocation = (Deno.env.get("MYCRMSIM_LOCATION_ID") ?? "").trim();
  const locationId = asString(body.location_id);
  if (expectedLocation && locationId && locationId !== expectedLocation) {
    return { kind: "skip" as const, reason: "location" };
  }
  const from =
    asString(body.phone) || asString(body.from_number) || asString(body.number);
  const ours = last10(
    (Deno.env.get("MYCRMSIM_FROM_NUMBER") ?? Deno.env.get("SENDBLUE_FROM_NUMBER") ?? "").trim(),
  );
  if (ours && last10(from) && ours === last10(from)) return { kind: "outbound-echo" as const };
  const text =
    (typeof raw.message === "string" ? raw.message : "") ||
    asString(body.message) ||
    asString(body.content);
  const mediaUrl = firstAttachmentUrl(body.attachments) || asString(body.media_url);
  if (!from) return { kind: "skip" as const, reason: "no_phone" };
  if (!text.trim() && !mediaUrl) return { kind: "skip" as const, reason: "empty" };
  return {
    kind: "inbound" as const,
    from,
    body: text.trim() || "(photo or attachment)",
    handle: asString(body.message_id) || asString(body.message_handle),
    mediaUrl,
    sentAt: asString(body.date_sent) || asString(body.created_at) || null,
  };
}

function webhookAuthorized(request: Request) {
  const expected = (Deno.env.get("MESSAGES_WEBHOOK_TOKEN") ?? "").trim();
  if (!expected) return true;
  const url = new URL(request.url);
  const header = request.headers.get("x-webhook-token")?.trim() || "";
  const query = url.searchParams.get("token")?.trim() || "";
  const auth = request.headers.get("authorization")?.trim() || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  return header === expected || query === expected || bearer === expected;
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
  if (!webhookAuthorized(request)) {
    return json({ error: "Unauthorized." }, 401);
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

  const event = parseEvent(raw);
  if (event.kind !== "inbound") {
    return json({ ok: true, skipped: true, reason: event.kind === "skip" ? event.reason : event.kind });
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/ingest_inbound_text`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_from: event.from,
      p_body: event.body,
      p_handle: event.handle,
      p_media_url: event.mediaUrl,
      p_sent_at: event.sentAt,
    }),
  });

  const payload = await response.json().catch(() => ({ ok: true }));
  return json(payload, response.ok ? 200 : 500);
});
