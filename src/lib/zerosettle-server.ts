import { ASSISTANT_NAME } from "./product.ts";
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
