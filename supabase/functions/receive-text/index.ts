/**
 * Receive webhook for myCRMSIM inbound texts, status, and calls.
 * Same ingest path as /api/messages/inbound — use whichever URL you put on the workspace.
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-token",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstMedia(value: unknown) {
  if (!Array.isArray(value)) return "";
  const found = value.find((item) => typeof item === "string" && item.trim());
  return typeof found === "string" ? found.trim() : "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (request.method === "GET") {
    return json({ ok: true, provider: "mycrmsim" });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Missing Supabase service credentials." }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: true, skipped: true, reason: "unreadable" });
  }

  const type = asString(body.type || body.event).toUpperCase().replace(/[\s_]/g, "-");
  const locationId = asString(body.location_id || body.locationId);
  const phone = asString(body.phone || body.from || body.number);
  const message = asString(body.message || body.content || body.body);
  const messageId = asString(body.message_id || body.messageId);
  const status = asString(body.status).toUpperCase();
  const isMe = body.isMe === true || body.is_me === true;
  const mediaUrl = firstMedia(body.attachments) || asString(body.media_url);

  let kind = "";
  if (
    type === "STATUS" ||
    type === "STATUS-UPDATE" ||
    type.startsWith("STATUS-") ||
    (status && messageId && type !== "MESSAGE" && type !== "CALL")
  ) {
    kind = "status";
  } else if (type === "CALL" || type.endsWith("-CALL")) {
    kind = "call";
  } else if (type === "MESSAGE" || (locationId && (phone || message))) {
    kind = "message";
  } else {
    return json({ ok: true, skipped: true, reason: "ignored" });
  }

  const url = new URL(request.url);
  const token =
    request.headers.get("x-webhook-token")?.trim() ||
    url.searchParams.get("token")?.trim() ||
    "";

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/ingest_mycrmsim_event`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_location_id: locationId,
      p_token: token,
      p_kind: kind,
      p_phone: phone,
      p_body: message,
      p_message_id: messageId,
      p_status: status,
      p_is_me: isMe,
      p_media_url: mediaUrl,
    }),
  });

  const payload = await response.json().catch(() => ({ ok: true }));
  return json(payload, response.ok ? 200 : 500);
});
