/**
 * Receive webhook for one company's Photon texts.
 * Same ingest path as /api/messages/inbound. The ?token= value is that company's webhook token.
 */
import { authorizeInboundWebhook, parseInboundText } from "../_shared/photon-webhook.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-token, x-spectrum-timestamp, x-spectrum-signature",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
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

  const rawBody = await request.text();
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() || request.headers.get("x-webhook-token")?.trim() || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Missing Supabase service credentials." }, 500);
  }

  const lookup = await fetch(
    `${supabaseUrl}/rest/v1/photon_connections?webhook_token=eq.${encodeURIComponent(token)}&select=webhook_secret,from_number,linked`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );
  const rows = await lookup.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  const secret = row && row.linked !== false && typeof row.webhook_secret === "string" ? row.webhook_secret : "";
  const fromNumber = row && typeof row.from_number === "string" ? row.from_number : "";
  if (!secret) return json({ error: "Unauthorized." }, 401);

  const auth = authorizeInboundWebhook({
    secret,
    token: "",
    headerToken: "",
    queryToken: "",
    timestamp: request.headers.get("x-spectrum-timestamp") || "",
    signature: request.headers.get("x-spectrum-signature") || "",
    rawBody,
  });
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let raw: unknown = {};
  try {
    raw = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json({ ok: true, skipped: true });
  }

  const parsed = parseInboundText(raw, fromNumber);
  if (parsed.skip) return json({ ok: true, skipped: true, reason: parsed.reason });

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/ingest_inbound_text`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_from: parsed.from,
      p_body: parsed.body,
      p_handle: parsed.handle,
      p_media_url: parsed.mediaUrl,
      p_sent_at: parsed.sentAt,
    }),
  });

  const payload = await response.json().catch(() => ({ ok: true }));
  return json(payload, response.ok ? 200 : 500);
});
