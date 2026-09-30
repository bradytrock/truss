/**
 * Receive webhook for Photon inbound texts.
 * Same ingest path as /api/messages/inbound — register whichever URL you give Photon.
 * Deploy with verify_jwt = false. The signing secret is the real check.
 */
import {
  authorizeInboundWebhook,
  parseInboundText,
} from "../_shared/photon-webhook.ts";

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
  const auth = authorizeInboundWebhook({
    secret:
      (Deno.env.get("SPECTRUM_WEBHOOK_SECRET") ?? "").trim() ||
      (Deno.env.get("SPECTRUM_SIGNING_SECRET") ?? "").trim(),
    token: (Deno.env.get("MESSAGES_WEBHOOK_TOKEN") ?? "").trim(),
    headerToken: request.headers.get("x-webhook-token") || "",
    queryToken: url.searchParams.get("token") || "",
    timestamp: request.headers.get("x-spectrum-timestamp") || "",
    signature: request.headers.get("x-spectrum-signature") || "",
    rawBody,
  });
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Missing Supabase service credentials." }, 500);
  }

  let raw: unknown = {};
  try {
    raw = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json({ ok: true, skipped: true });
  }

  const ours =
    (Deno.env.get("PHOTON_FROM_NUMBER") ?? "").trim() ||
    (Deno.env.get("SENDBLUE_FROM_NUMBER") ?? "").trim();
  const parsed = parseInboundText(raw, ours);
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
