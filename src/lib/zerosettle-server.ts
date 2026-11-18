import { ASSISTANT_NAME } from "./product.ts";
import { getSupabaseUrl } from "./supabase/env.ts";
import { publicSeedLine } from "./cassio-guard.ts";
import {
  ZEROSETTLE_BASE,
  cassioAgentBody,
  cassioLineQuery,
  parseCassioLine,
  resolveCassioLine,
  zerosettleFailure,
  type CassioLineChoice,
  type ParsedCassioLine,
} from "./zerosettle.ts";

export const CASSIO_WRITE_TOOLS = [
  "log_client_communication",
  "schedule_job_appointment",
  "share_lead_status",
  "draft_estimate",
];

export type HostedCassioLine = {
  choice: CassioLineChoice;
  yourNumber: string;
  active: boolean;
  profileName: string;
  creditsLeft: number | null;
  /** True when other numbers share the sender, so the contact card was left alone. */
  sharesSender: boolean;
  profileWarning: string;
};

type Ok = { ok: true; line: HostedCassioLine };
type Err = { ok: false; status: number; code: string; message: string; lines?: CassioLineChoice[] };

async function zerosettleFetch(token: string, path: string, init?: RequestInit) {
  const response = await fetch(`${ZEROSETTLE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  return { response, payload };
}

export async function readZerosettleLine(token: string): Promise<{ ok: true; line: ParsedCassioLine } | Err> {
  try {
    const { response, payload } = await zerosettleFetch(token, "/api/imessage/line");
    if (!response.ok) {
      const failure = zerosettleFailure(response.status, payload);
      return { ok: false, status: response.status, ...failure };
    }
    return { ok: true, line: parseCassioLine(payload) };
  } catch {
    return { ok: false, status: 502, code: "unreachable", message: "Could not reach ZeroSettle." };
  }
}

/**
 * Point one personal line at ZeroSettle's hosted assistant.
 * Does not send messages and does not touch the office texting line.
 */
export async function configureHostedCassio(
  token: string,
  input: { companyName: string; seatName: string; timeZone: string; lineId: string },
): Promise<Ok | Err> {
  const read = await readZerosettleLine(token);
  if (!read.ok) return read;
  if (!read.line.active) {
    const failure = zerosettleFailure(402, null);
    return { ok: false, status: 402, ...failure };
  }
  const resolved = resolveCassioLine(read.line, input.lineId);
  if (!resolved.ok) {
    return {
      ok: false,
      status: resolved.code === "choose_line" ? 409 : 422,
      code: resolved.code,
      message: resolved.code === "choose_line" ? "Choose which ZeroSettle number Cassio should use." : resolved.message,
      lines: resolved.code === "choose_line" ? resolved.lines : undefined,
    };
  }

  const query = cassioLineQuery(resolved.choice);
  const body = cassioAgentBody(input);
  try {
    const { response, payload } = await zerosettleFetch(token, `/api/imessage/agent${query}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const failure = zerosettleFailure(response.status, payload);
      return { ok: false, status: response.status, ...failure };
    }
  } catch {
    return { ok: false, status: 502, code: "unreachable", message: "Could not reach ZeroSettle." };
  }

  let profileName = read.line.profileName;
  let profileWarning = "";
  if (!resolved.sharesSender) {
    try {
      const { response, payload } = await zerosettleFetch(token, `/api/imessage/profile${query}`, {
        method: "PUT",
        body: JSON.stringify({ name: ASSISTANT_NAME }),
      });
      if (response.ok) profileName = ASSISTANT_NAME;
      else profileWarning = zerosettleFailure(response.status, payload).message;
    } catch {
      profileWarning = "The assistant is on, and the contact card name could not be updated.";
    }
  }

  return {
    ok: true,
    line: {
      choice: resolved.choice,
      yourNumber: read.line.yourNumber,
      active: true,
      profileName,
      creditsLeft: read.line.creditsLeft,
      sharesSender: resolved.sharesSender,
      profileWarning,
    },
  };
}

function mcpServers(payload: unknown) {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const lists = [root.servers, root.data, root.mcp_servers, Array.isArray(payload) ? payload : null];
  const found: { id: string; url: string }[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const url = typeof row.url === "string" ? row.url : "";
      const id = typeof row.id === "string" ? row.id : "";
      if (url) found.push({ id, url });
    }
  }
  return found;
}

/** Attach the seat's book tools to the hosted assistant. Read-only tools turn on by themselves. */
export async function registerCassioBook(
  token: string,
  input: { query: string; bookUrl: string; mcpToken: string },
): Promise<{ ok: boolean; warning: string }> {
  if (!input.bookUrl) {
    return {
      ok: false,
      warning: "Open the live https site and press Update Cassio so this number can look up your book.",
    };
  }
  try {
    const listed = await zerosettleFetch(token, `/api/imessage/agent/mcp${input.query}`);
    const current = listed.response.ok
      ? mcpServers(listed.payload).find((server) => server.url.replace(/\/+$/, "") === input.bookUrl)
      : undefined;
    if (current?.id) {
      const patched = await zerosettleFetch(token, `/api/imessage/agent/mcp/${current.id}${input.query}`, {
        method: "PATCH",
        body: JSON.stringify({ token: input.mcpToken, refresh: true, enable_tools: CASSIO_WRITE_TOOLS }),
      });
      if (patched.response.ok) return { ok: true, warning: "" };
      return { ok: false, warning: zerosettleFailure(patched.response.status, patched.payload).message };
    }
    if (current) return { ok: true, warning: "" };
    const created = await zerosettleFetch(token, `/api/imessage/agent/mcp${input.query}`, {
      method: "POST",
      body: JSON.stringify({ url: input.bookUrl, token: input.mcpToken }),
    });
    if (!created.response.ok) {
      return { ok: false, warning: zerosettleFailure(created.response.status, created.payload).message };
    }
    const createdId = mcpServers([created.payload])[0]?.id;
    if (createdId) {
      await zerosettleFetch(token, `/api/imessage/agent/mcp/${createdId}${input.query}`, {
        method: "PATCH",
        body: JSON.stringify({ refresh: true, enable_tools: CASSIO_WRITE_TOOLS }),
      });
    }
    return { ok: true, warning: "" };
  } catch {
    return { ok: false, warning: "Could not reach ZeroSettle to connect the book lookup." };
  }
}

/** Text the seat from their own Cassio number when a homeowner opens an estimate. */
export async function sendCassioEstimateUpdate(input: { staffId: string; to: string; text: string }) {
  const staffId = input.staffId.trim();
  const to = input.to.trim();
  const text = input.text.trim();
  if (!staffId || !to || !text) return;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!key) return;
  try {
    const response = await fetch(`${getSupabaseUrl()}/rest/v1/rpc/cassio_line_send_target`, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_staff_id: staffId }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.error("[cassio] estimate opened text", response.status);
      return;
    }
    const target = (await response.json().catch(() => null)) as { ok?: boolean; apiToken?: string; lineId?: string } | null;
    const apiToken = target?.apiToken?.trim() ?? "";
    if (!target?.ok || !apiToken) return;
    const sent = await zerosettleFetch(apiToken, "/api/imessage/send", {
      method: "POST",
      body: JSON.stringify({
        to,
        text,
        ...(target.lineId ? { line_id: target.lineId } : {}),
      }),
    });
    if (!sent.response.ok) console.error("[cassio] estimate opened text", sent.response.status);
  } catch (error) {
    console.error("[cassio] estimate opened text", error instanceof Error ? error.message : "failed");
  }
}

export async function zerosettleMessages(token: string, lineId: string) {
  const query = lineId ? `?line_id=${encodeURIComponent(lineId)}` : "";
  const { response, payload } = await zerosettleFetch(token, `/api/imessage/messages${query}`);
  if (!response.ok) return [];
  return payload;
}

export async function zerosettleGroups(token: string, lineId: string) {
  const query = lineId ? `?line_id=${encodeURIComponent(lineId)}` : "";
  const { response, payload } = await zerosettleFetch(token, `/api/imessage/groups${query}`);
  if (!response.ok) return [];
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const groups = Array.isArray(root.groups) ? root.groups : Array.isArray(payload) ? payload : [];
  return groups
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const row = item as Record<string, unknown>;
      return typeof row.chat_id === "string" ? row.chat_id : "";
    })
    .filter(Boolean);
}

export async function zerosettleGroupMessages(token: string, chatId: string) {
  const { response, payload } = await zerosettleFetch(
    token,
    `/api/imessage/messages?chat_id=${encodeURIComponent(chatId)}`,
  );
  if (!response.ok) return null;
  return payload;
}

/** Post one non-financial line into the verified Seeds chat. No other chat id is accepted. */
export async function sendCassioSeedLine(input: { apiToken: string; chatId: string; lineId?: string; text: string }) {
  const text = publicSeedLine(input.text);
  const chatId = input.chatId.trim();
  if (!text || !chatId || !input.apiToken.trim()) return false;
  try {
    const sent = await zerosettleFetch(input.apiToken, "/api/imessage/send", {
      method: "POST",
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(input.lineId ? { line_id: input.lineId } : {}),
      }),
    });
    return sent.response.ok;
  } catch {
    return false;
  }
}
