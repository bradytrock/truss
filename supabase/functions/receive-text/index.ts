/**
 * Receive webhook for Sendblue inbound texts.
 * Same ingest path as /api/messages/inbound — use whichever URL you put in Sendblue.
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-token",
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

function flatten(body: Record<string, unknown>) {
  const nested = body.message;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...body, ...(nested as Record<string, unknown>) };
  }
  return body;
}

function isOutboundPayload(body: Record<string, unknown>) {
  if (body.is_outbound === true) return true;
  const from = asString(body.from_number) || asString(body.number);
  const ours = (Deno.env.get("SENDBLUE_FROM_NUMBER") ?? "").trim();
  const fromKey = last10(from);
  const oursKey = last10(ours);
  return Boolean(oursKey && fromKey && fromKey === oursKey);
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

  const body = flatten(raw);
  if (isOutboundPayload(body)) {
    return json({ ok: true, skipped: true, reason: "outbound" });
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/ingest_inbound_text`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_from: asString(body.from_number) || asString(body.number),
      p_body: asString(body.content),
      p_handle: asString(body.message_handle),
      p_media_url: asString(body.media_url),
      p_sent_at: asString(body.date_sent) || null,
    }),
  });

  const payload = await response.json().catch(() => ({ ok: true }));
  return json(payload, response.ok ? 200 : 500);
});
