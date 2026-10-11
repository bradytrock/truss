/**
 * Writes from this desk already update local state. Realtime then echoes those
 * rows and used to reload the entire company book. Remember the row ids from
 * our own REST writes so that echo can be ignored.
 */

const ECHO_TTL_MS = 20_000;
const RECENT_WRITE_MS = 8_000;

const echoes = new Map<string, number>();
let lastRestWriteAt = 0;

export function resetLocalWriteEchoes() {
  echoes.clear();
  lastRestWriteAt = 0;
}

export function noteLocalRow(id: string, now = Date.now()) {
  if (!id) return;
  echoes.set(id, now + ECHO_TTL_MS);
}

export function isLocalWriteEcho(id: string, now = Date.now()) {
  const expires = echoes.get(id);
  if (!expires) return false;
  if (expires <= now) {
    echoes.delete(id);
    return false;
  }
  return true;
}

export function markRestWrite(now = Date.now()) {
  lastRestWriteAt = now;
}

export function recentRestWrite(now = Date.now()) {
  return now - lastRestWriteAt < RECENT_WRITE_MS;
}

/** Skip a live reload when every echoed id came from a write this desk just made. */
export function shouldSkipLiveRefresh(ids: readonly string[], now = Date.now()) {
  return ids.length > 0 && ids.every((id) => id.length > 0 && isLocalWriteEcho(id, now));
}

/**
 * While a write is still in flight, the realtime echo can arrive before we
 * have parsed the response. Wait once, then reload if the ids are still foreign.
 */
export function liveRefreshDecision(
  ids: readonly string[],
  grace: number,
  now = Date.now(),
): "skip" | "wait" | "refresh" {
  if (shouldSkipLiveRefresh(ids, now)) return "skip";
  if (grace < 1 && recentRestWrite(now) && ids.length > 0 && ids.every((id) => id.length > 0)) {
    return "wait";
  }
  return "refresh";
}

export function changedRowId(payload: { new?: unknown; old?: unknown }) {
  const next = rowId(payload.new);
  if (next) return next;
  return rowId(payload.old);
}

function rowId(value: unknown) {
  if (!value || typeof value !== "object" || !("id" in value)) return "";
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" ? id : "";
}

export function idsFromRestUrl(url: string) {
  const query = url.split("?")[1] ?? "";
  if (!query) return [];
  const params = new URLSearchParams(query);
  const id = params.get("id");
  if (!id) return [];
  if (id.startsWith("eq.")) return [id.slice(3)].filter(Boolean);
  if (id.startsWith("in.(") && id.endsWith(")")) {
    return id
      .slice(4, -1)
      .split(",")
      .map((part) => part.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
  }
  return [];
}

export function restWriteTarget(input: RequestInfo | URL, init?: RequestInit) {
  const url =
    input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
  if (!url.includes("/rest/v1/") || url.includes("/rest/v1/rpc/")) return null;
  const method = (
    init?.method ||
    (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET")
  ).toUpperCase();
  if (method === "GET" || method === "HEAD") return null;
  const body = typeof init?.body === "string" ? init.body : null;
  return { url, method, body };
}

function noteParsed(value: unknown) {
  if (Array.isArray(value)) {
    for (const row of value) noteParsed(row);
    return;
  }
  const id = rowId(value);
  if (id) noteLocalRow(id);
}

/** Record ids from a finished PostgREST write. Failed writes are ignored. */
export function observeRestWrite(
  target: { url: string; body: string | null },
  response: { ok: boolean; body?: unknown },
) {
  if (!response.ok) return;
  for (const id of idsFromRestUrl(target.url)) noteLocalRow(id);
  if (target.body) {
    try {
      noteParsed(JSON.parse(target.body));
    } catch {
      // Request body was not JSON.
    }
  }
  if (response.body !== undefined) noteParsed(response.body);
}

export function installLocalWriteTracker() {
  if (typeof window === "undefined") return;
  const flagged = window as Window & { __trussLocalWriteTracker?: boolean };
  if (flagged.__trussLocalWriteTracker) return;
  flagged.__trussLocalWriteTracker = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = restWriteTarget(input, init);
    if (target) markRestWrite();
    const response = await original(input, init);
    if (!target || !response.ok) return response;
    observeRestWrite(target, { ok: true });
    try {
      void response
        .clone()
        .json()
        .then((body) => noteParsed(body))
        .catch(() => undefined);
    } catch {
      // Body could not be cloned.
    }
    return response;
  };
}
