/**
 * Proxies a signed-in send to the long-lived Photon worker.
 * Spectrum has no HTTP send API, so this function cannot talk to iMessage itself.
 * Set PHOTON_WORKER_URL and PHOTON_WORKER_SECRET in Edge Function secrets when
 * those values are not on the Next.js host.
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}

function workerUrl() {
  const raw = (Deno.env.get("PHOTON_WORKER_URL") ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function workerSecret() {
  return (Deno.env.get("PHOTON_WORKER_SECRET") ?? "").trim();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const base = workerUrl();
  const secret = workerSecret();
  const configured = Boolean(base && secret);

  if (request.method === "GET") {
    if (!configured) return json({ configured: false, fromNumber: "" });
    try {
      const response = await fetch(`${base}/status`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const payload = await response.json().catch(() => ({ configured: false, fromNumber: "" }));
      return json(payload, response.ok ? 200 : 502);
    } catch {
      return json({ configured: false, fromNumber: "" });
    }
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

  const to = typeof body.to === "string" ? body.to : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!to) return json({ error: "That phone number is not valid." }, 400);
  if (!content) return json({ error: "Write a message before sending." }, 400);

  if (!configured) {
    return json({ ok: true, mocked: true, to, configured: false });
  }

  try {
    const response = await fetch(`${base}/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to, content }),
    });
    const payload = await response.json().catch(() => ({ ok: false, error: "Photon could not send that text." }));
    return json(payload, response.ok ? 200 : response.status);
  } catch {
    return json({ ok: false, error: "Could not reach the Photon text worker." }, 502);
  }
});
