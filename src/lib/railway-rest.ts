/** When set, table and RPC calls use the Railway Postgres API. Login stays on Supabase. */
export function useRailwayDatabase() {
  return process.env.NEXT_PUBLIC_USE_RAILWAY_DATABASE === "1";
}

export function railwayRestPort() {
  return process.env.RAILWAY_REST_PORT?.trim() || "3210";
}

function isJwt(value: string) {
  return value.split(".").length === 3;
}

function restSuffix(url: string) {
  const at = url.indexOf("/rest/v1");
  if (at === -1) return null;
  return url.slice(at + "/rest/v1".length) || "/";
}

function withoutPublishableBearer(headers: Headers) {
  const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (bearer && !isJwt(bearer)) headers.delete("authorization");
  return headers;
}

/** Sends PostgREST calls to Railway. Auth, realtime, and storage keep their original URL. */
export const railwayRestFetch: typeof fetch = (input, init) => {
  if (!useRailwayDatabase()) return fetch(input, init);
  const raw =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const suffix = restSuffix(raw);
  if (!suffix) return fetch(input, init);

  const headers = new Headers(init?.headers);
  if (!init?.headers && input instanceof Request) {
    input.headers.forEach((value, key) => headers.set(key, value));
  }
  withoutPublishableBearer(headers);

  const target =
    typeof window === "undefined"
      ? `http://127.0.0.1:${railwayRestPort()}${suffix}`
      : `/rest/v1${suffix}`;
  return fetch(target, { ...init, headers });
};

export function railwayClientOptions(): { global?: { fetch: typeof fetch } } {
  if (!useRailwayDatabase()) return {};
  return { global: { fetch: railwayRestFetch } };
}
