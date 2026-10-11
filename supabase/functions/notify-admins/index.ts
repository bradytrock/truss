/**
 * Push pass-backs and rep notes to company admins' phones.
 *
 * Called by the enqueue_admin_lead_push trigger (pg_net) or a Database Webhook
 * on admin_push_outbox. Auth is x-notify-secret or the service-role bearer.
 *
 * TODO: service-worker Web Push for when the browser tab is closed. device_tokens
 * rows with platform = 'web' are stored and skipped here until that exists.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PushBody = {
  event?: string;
  company_id?: string;
  lead_id?: string;
  author_id?: string | null;
  title?: string;
  body?: string;
  activity_id?: string | null;
  outbox_id?: string | null;
};

let cachedJwt: { token: string; exp: number } | null = null;

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function authorized(req: Request) {
  const secret = Deno.env.get("NOTIFY_ADMINS_SECRET") ?? "";
  const header = req.headers.get("x-notify-secret") ?? "";
  if (secret && header === secret) return true;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (service && auth === `Bearer ${service}`) return true;
  return false;
}

function asPush(input: unknown): PushBody | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const nested = record.record && typeof record.record === "object"
    ? (record.record as Record<string, unknown>)
    : null;
  const payload = nested?.payload && typeof nested.payload === "object"
    ? (nested.payload as Record<string, unknown>)
    : record;
  const company = typeof payload.company_id === "string" ? payload.company_id : "";
  if (!UUID.test(company)) return null;
  return {
    event: typeof payload.event === "string" ? payload.event : "",
    company_id: company,
    lead_id: typeof payload.lead_id === "string" ? payload.lead_id : "",
    author_id: typeof payload.author_id === "string" ? payload.author_id : null,
    title: typeof payload.title === "string" ? payload.title : "Lead update",
    body: typeof payload.body === "string" ? payload.body : "",
    activity_id: typeof payload.activity_id === "string" ? payload.activity_id : null,
    outbox_id: typeof payload.outbox_id === "string"
      ? payload.outbox_id
      : nested && typeof nested.id === "string"
        ? nested.id
        : null,
  };
}

function restConfig() {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return { url, key };
}

async function rest(path: string, init: RequestInit = {}) {
  const { url, key } = restConfig();
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("authorization", `Bearer ${key}`);
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function pemToPkcs8(pem: string) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const raw = atob(body);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function apnsToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.exp - 60 > now) return cachedJwt.token;
  const keyId = Deno.env.get("APNS_KEY_ID") ?? "";
  const teamId = Deno.env.get("APNS_TEAM_ID") ?? "";
  const pem = (Deno.env.get("APNS_PRIVATE_KEY") ?? "").replaceAll("\\n", "\n");
  if (!keyId || !teamId || !pem) return "";
  const header = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid: keyId })));
  const exp = now + 50 * 60;
  const claims = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ iss: teamId, iat: now })));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(pem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signed = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${claims}`)),
  );
  const token = `${header}.${claims}.${bytesToBase64Url(signed)}`;
  cachedJwt = { token, exp };
  return token;
}

async function sendApns(token: string, jwt: string, push: PushBody) {
  const bundle = Deno.env.get("APNS_BUNDLE_ID") ?? "";
  const host = (Deno.env.get("APNS_ENV") ?? "production") === "sandbox"
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";
  const response = await fetch(`${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": bundle,
      "apns-push-type": "alert",
      "apns-priority": "10",
    },
    body: JSON.stringify({
      aps: {
        alert: { title: push.title, body: push.body },
        sound: "default",
      },
      lead_id: push.lead_id,
      event: push.event,
      activity_id: push.activity_id,
    }),
  });
  return response.status;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!authorized(req)) return json({ error: "unauthorized" }, 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const push = asPush(raw);
  if (!push?.company_id) return json({ error: "company_id required" }, 400);
  if (push.event !== "passback" && push.event !== "rep_note") {
    return json({ ok: true, skipped: "event" });
  }

  const admins = (await rest(
    `profiles?select=id&company_id=eq.${push.company_id}&role=eq.company_admin`,
  )) as Array<{ id: string }> | null;
  const recipients = (admins ?? [])
    .map((row) => row.id)
    .filter((id) => id && id !== push.author_id);
  if (!recipients.length) {
    await markSent(push.outbox_id);
    return json({ ok: true, sent: 0 });
  }

  const tokens = (await rest(
    `device_tokens?select=id,token,platform&user_id=in.(${recipients.join(",")})`,
  )) as Array<{ id: string; token: string; platform: string }> | null;

  const jwt = await apnsToken();
  const bundle = Deno.env.get("APNS_BUNDLE_ID") ?? "";
  if (!jwt || !bundle) {
    console.warn("notify-admins: APNs is not configured; push left for a later retry.");
    return json({ ok: true, skipped: "apns_not_configured", queued: (tokens ?? []).length });
  }

  let sent = 0;
  for (const device of tokens ?? []) {
    if (device.platform === "web") {
      // TODO: service-worker Web Push for when the tab is closed.
      continue;
    }
    if (device.platform !== "ios" || !device.token) continue;
    const status = await sendApns(device.token, jwt, push);
    if (status === 200) {
      sent += 1;
      continue;
    }
    if (status === 410 || status === 400) {
      await rest(`device_tokens?id=eq.${device.id}`, { method: "DELETE" });
    }
  }

  await markSent(push.outbox_id);
  return json({ ok: true, sent });
});

async function markSent(outboxId: string | null | undefined) {
  if (!outboxId || !UUID.test(outboxId)) return;
  await rest(`admin_push_outbox?id=eq.${outboxId}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ sent_at: new Date().toISOString() }),
  });
}
