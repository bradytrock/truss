import { toE164 } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";

export type PhotonTextStatus = { configured: boolean; fromNumber: string };

export type PhotonTextResult =
  | { ok: true; mocked: boolean; to: string; handle: string }
  | { ok: false; mocked: false; error: string };

function workerSecret() {
  return process.env.PHOTON_WORKER_SECRET?.trim() || "";
}

export function photonWorkerUrl() {
  const raw = process.env.PHOTON_WORKER_URL?.trim() || "";
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

/** True when this Next.js process can call the long-lived Photon worker directly. */
export function photonWorkerConfigured() {
  return Boolean(photonWorkerUrl() && workerSecret());
}

function workerHeaders() {
  return {
    Authorization: `Bearer ${workerSecret()}`,
    "Content-Type": "application/json",
  };
}

async function photonWorkerRequest(input: { method: "GET" | "POST"; path: string; body?: Record<string, string> }) {
  const response = await fetch(`${photonWorkerUrl()}${input.path}`, {
    method: input.method,
    headers: workerHeaders(),
    body: input.method === "POST" ? JSON.stringify(input.body ?? {}) : undefined,
    signal: AbortSignal.timeout(25_000),
  });
  return response;
}

async function photonFunctionRequest(input: { method: "GET" | "POST"; body?: Record<string, string> }) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;

  const response = await fetch(`${getSupabaseUrl()}/functions/v1/send-text`, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: getSupabaseKey(),
      "Content-Type": "application/json",
    },
    body: input.method === "POST" ? JSON.stringify(input.body ?? {}) : undefined,
    signal: AbortSignal.timeout(25_000),
  });
  return response;
}

function readStatus(payload: Record<string, unknown>): PhotonTextStatus {
  return {
    configured: Boolean(payload.configured),
    fromNumber: typeof payload.fromNumber === "string" ? payload.fromNumber : "",
  };
}

export async function photonStatus(): Promise<PhotonTextStatus> {
  if (photonWorkerConfigured()) {
    try {
      const response = await photonWorkerRequest({ method: "GET", path: "/status" });
      if (!response.ok) return { configured: false, fromNumber: "" };
      return readStatus((await response.json()) as Record<string, unknown>);
    } catch {
      return { configured: false, fromNumber: "" };
    }
  }
  try {
    const response = await photonFunctionRequest({ method: "GET" });
    if (!response || !response.ok) return { configured: false, fromNumber: "" };
    return readStatus((await response.json()) as Record<string, unknown>);
  } catch {
    return { configured: false, fromNumber: "" };
  }
}

function readSendPayload(payload: Record<string, unknown>, to: string): PhotonTextResult {
  if (payload.ok === false) {
    const message =
      (typeof payload.error === "string" && payload.error) || "Photon could not send that text.";
    return { ok: false, mocked: false, error: message };
  }
  return {
    ok: true,
    mocked: Boolean(payload.mocked),
    to: typeof payload.to === "string" && payload.to ? payload.to : to,
    handle: typeof payload.handle === "string" ? payload.handle : "",
  };
}

async function photonTextViaWorker(to: string, content: string): Promise<PhotonTextResult> {
  let response: Response;
  try {
    response = await photonWorkerRequest({ method: "POST", path: "/send", body: { to, content } });
  } catch {
    return { ok: false, mocked: false, error: "Could not reach the Photon text worker." };
  }
  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  if (!response.ok || payload.ok === false) {
    const message =
      (typeof payload.error === "string" && payload.error) ||
      `Photon could not send that text (${response.status}).`;
    return { ok: false, mocked: false, error: message };
  }
  return readSendPayload(payload, to);
}

async function photonTextViaFunction(to: string, content: string): Promise<PhotonTextResult> {
  const response = await photonFunctionRequest({ method: "POST", body: { to, content } });
  if (!response) {
    return { ok: false, mocked: false, error: "Photon texting is not configured on this host." };
  }
  if (response.status === 404) {
    return { ok: true, mocked: true, to, handle: `mock_${Date.now()}` };
  }
  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  if (!response.ok || payload.ok === false) {
    const message =
      (typeof payload.error === "string" && payload.error) || "Photon could not send that text.";
    return { ok: false, mocked: false, error: message };
  }
  return readSendPayload(payload, to);
}

export async function photonText(input: { to: string; content: string }): Promise<PhotonTextResult> {
  const to = toE164(input.to);
  const content = input.content.trim();
  if (!to) return { ok: false, mocked: false, error: "That phone number is not valid." };
  if (!content) return { ok: false, mocked: false, error: "Write a message before sending." };

  if (photonWorkerConfigured()) return photonTextViaWorker(to, content);

  try {
    return await photonTextViaFunction(to, content);
  } catch {
    return { ok: true, mocked: true, to, handle: `mock_${Date.now()}` };
  }
}
