/**
 * Long-lived Photon / Spectrum sender.
 *
 * Vercel and Supabase Edge Functions cannot hold Spectrum's iMessage gRPC
 * connection, and Spectrum has no public HTTP send API. This process stays
 * up, and the Next.js app calls it with PHOTON_WORKER_URL + PHOTON_WORKER_SECRET.
 *
 *   SPECTRUM_PROJECT_ID
 *   SPECTRUM_PROJECT_SECRET
 *   PHOTON_WORKER_SECRET
 *   PHOTON_FROM_NUMBER          optional dedicated line, E.164
 *   PHOTON_WORKER_PORT          default 8787
 *   PHOTON_WORKER_HOST          default 0.0.0.0
 */
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const port = Number(process.env.PHOTON_WORKER_PORT || "8787");
const host = process.env.PHOTON_WORKER_HOST?.trim() || "0.0.0.0";
const workerSecret = process.env.PHOTON_WORKER_SECRET?.trim() || "";
const projectId = process.env.SPECTRUM_PROJECT_ID?.trim() || "";
const projectSecret = process.env.SPECTRUM_PROJECT_SECRET?.trim() || "";

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

const fromNumber = toE164(process.env.PHOTON_FROM_NUMBER || "");

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

function fromLabel() {
  return fromNumber ? `ending ${fromNumber.slice(-4)}` : "";
}

let spectrum = null;
let starting = null;
let connectError = "";

async function ensureSpectrum() {
  if (spectrum) return spectrum;
  if (!projectId || !projectSecret) return null;
  if (!starting) {
    starting = (async () => {
      const { Spectrum } = await import("@spectrum-ts/core");
      const { imessage } = await import("@spectrum-ts/imessage");
      const app = await Spectrum({
        projectId,
        projectSecret,
        providers: [imessage.config()],
      });
      spectrum = { app, im: imessage(app) };
      connectError = "";
      return spectrum;
    })().catch((error) => {
      starting = null;
      spectrum = null;
      connectError = error instanceof Error ? error.message : "Photon line did not connect.";
      console.error("[photon-worker] connect failed", connectError);
      throw error;
    });
  }
  return starting;
}

function messageHandle(sent) {
  if (!sent) return "";
  if (typeof sent === "string") return sent;
  if (typeof sent.id === "string") return sent.id;
  return "";
}

async function sendText(to, content) {
  const client = await ensureSpectrum();
  if (!client) {
    const error = "Set SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET on the Photon worker.";
    return { status: 503, body: { ok: false, error } };
  }
  const user = await client.im.user(to);
  const space = fromNumber
    ? await client.im.space.create(user, { phone: fromNumber })
    : await client.im.space.create(user);
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
    const ready = Boolean(spectrum) || !projectId || !projectSecret;
    json(response, ready ? 200 : 503, { ok: ready, configured: Boolean(spectrum) });
    return;
  }

  if (!authorized(request)) {
    json(response, 401, { ok: false, error: "Unauthorized." });
    return;
  }

  if (request.method === "GET" && (path === "/status" || path === "/")) {
    json(response, 200, {
      configured: Boolean(spectrum),
      fromNumber: fromLabel(),
      error: connectError || undefined,
    });
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
    if (!to) {
      json(response, 400, { ok: false, error: "That phone number is not valid." });
      return;
    }
    if (!content) {
      json(response, 400, { ok: false, error: "Write a message before sending." });
      return;
    }
    try {
      const result = await sendText(to, content);
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
  if (projectId && projectSecret) {
    void ensureSpectrum().catch(() => {});
  } else {
    console.error("[photon-worker] SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET are not set");
  }
});

function shutdown() {
  server.close();
  const app = spectrum?.app;
  if (app && typeof app.stop === "function") {
    void Promise.resolve(app.stop()).finally(() => process.exit(0));
    return;
  }
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
