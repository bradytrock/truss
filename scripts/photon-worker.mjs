/**
 * Long-lived Photon / Spectrum sender.
 *
 * Vercel and Supabase Edge Functions cannot hold Spectrum's iMessage gRPC
 * connection, and Spectrum has no public HTTP send API. This process stays
 * up, and the Next.js app calls it with PHOTON_WORKER_URL + PHOTON_WORKER_SECRET.
 *
 * Photon project id, secret, and from-number live on each company. This
 * process only needs:
 *
 *   PHOTON_WORKER_SECRET
 *   PHOTON_WORKER_PORT          default 8787
 *   PHOTON_WORKER_HOST          default 0.0.0.0
 *   SUPABASE_URL                so background sends can load that company
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const port = Number(process.env.PHOTON_WORKER_PORT || "8787");
const host = process.env.PHOTON_WORKER_HOST?.trim() || "0.0.0.0";
const workerSecret = process.env.PHOTON_WORKER_SECRET?.trim() || "";
const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
  .trim()
  .replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

function digitsOnly(value) {
  return value.replace(/\D/g, "");
}

function toE164(value) {
  const trimmed = String(value ?? "").trim();
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

function json(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function authorized(request) {
  if (!workerSecret) return false;
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(workerSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const clients = new Map();

async function accountFromDatabase(companyId) {
  if (!supabaseUrl || !serviceKey || !companyId) return null;
  const response = await fetch(
    `${supabaseUrl}/rest/v1/photon_connections?company_id=eq.${encodeURIComponent(companyId)}&select=project_id,project_secret,from_number,linked`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || row.linked === false) return null;
  const projectId = typeof row.project_id === "string" ? row.project_id.trim() : "";
  const projectSecret = typeof row.project_secret === "string" ? row.project_secret.trim() : "";
  const fromNumber = toE164(typeof row.from_number === "string" ? row.from_number : "");
  if (!projectId || !projectSecret || !fromNumber) return null;
  return { projectId, projectSecret, fromNumber };
}

async function clientFor(account) {
  const existing = clients.get(account.projectId);
  if (existing && existing.secret === account.projectSecret) return existing;
  if (existing?.app && typeof existing.app.stop === "function") {
    await Promise.resolve(existing.app.stop()).catch(() => {});
  }
  const { Spectrum } = await import("@spectrum-ts/core");
  const { imessage } = await import("@spectrum-ts/imessage");
  const app = await Spectrum({
    projectId: account.projectId,
    projectSecret: account.projectSecret,
    providers: [imessage.config()],
  });
  const next = { secret: account.projectSecret, app, im: imessage(app) };
  clients.set(account.projectId, next);
  return next;
}

function messageHandle(sent) {
  if (!sent) return "";
  if (typeof sent === "string") return sent;
  if (typeof sent.id === "string") return sent.id;
  return "";
}

async function sendText(to, content, account) {
  const client = await clientFor(account);
  const user = await client.im.user(to);
  const space = await client.im.space.create(user, { phone: account.fromNumber });
  const sent = await space.send(content);
  return {
    status: 200,
    body: { ok: true, mocked: false, configured: true, to, handle: messageHandle(sent) },
  };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 64_000) {
        fail(new Error("Message is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => done(Buffer.concat(chunks).toString("utf8")));
    request.on("error", fail);
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const path = url.pathname.replace(/\/$/, "") || "/";

  if (request.method === "GET" && path === "/health") {
    json(response, 200, { ok: true, configured: Boolean(workerSecret) });
    return;
  }

  if (!authorized(request)) {
    json(response, 401, { ok: false, error: "Unauthorized." });
    return;
  }

  if (request.method === "GET" && (path === "/status" || path === "/")) {
    json(response, 200, { configured: true, fromNumber: "" });
    return;
  }

  if (request.method === "POST" && (path === "/send" || path === "/")) {
    let raw = "";
    try {
      raw = await readBody(request);
    } catch (error) {
      json(response, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "Could not read that request.",
      });
      return;
    }
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      json(response, 400, { ok: false, error: "Could not read that request." });
      return;
    }
    const to = toE164(typeof body.to === "string" ? body.to : "");
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
    let account = {
      projectId: typeof body.projectId === "string" ? body.projectId.trim() : "",
      projectSecret: typeof body.projectSecret === "string" ? body.projectSecret.trim() : "",
      fromNumber: toE164(typeof body.fromNumber === "string" ? body.fromNumber : ""),
    };
    if (!to) {
      json(response, 400, { ok: false, error: "That phone number is not valid." });
      return;
    }
    if (!content) {
      json(response, 400, { ok: false, error: "Write a message before sending." });
      return;
    }
    if (!account.projectId || !account.projectSecret || !account.fromNumber) {
      account = (await accountFromDatabase(companyId)) || account;
    }
    if (!account.projectId || !account.projectSecret || !account.fromNumber) {
      json(response, 409, {
        ok: false,
        error: "Connect Photon for this company in Settings.",
      });
      return;
    }
    try {
      const result = await sendText(to, content, account);
      json(response, result.status, result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Photon could not send that text.";
      console.error("[photon-worker] send failed", message);
      json(response, 502, { ok: false, error: message });
    }
    return;
  }

  json(response, 404, { ok: false, error: "Not found." });
});

server.listen(port, host, () => {
  console.log(`[photon-worker] listening on ${host}:${port}`);
  if (!workerSecret) console.error("[photon-worker] PHOTON_WORKER_SECRET is not set");
  if (!supabaseUrl || !serviceKey) {
    console.error("[photon-worker] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set");
  }
});

function shutdown() {
  server.close();
  const stops = [];
  for (const client of clients.values()) {
    if (client.app && typeof client.app.stop === "function") {
      stops.push(Promise.resolve(client.app.stop()).catch(() => {}));
    }
  }
  void Promise.all(stops).finally(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
