/** Table and RPC calls use Railway Postgres. Set to 0 to send them to Supabase instead. */
export function railwayDatabaseEnabled() {
  const flag = process.env.NEXT_PUBLIC_USE_RAILWAY_DATABASE?.trim() ?? "";
  return flag !== "0" && flag !== "false";
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

function isSupabaseHost(url: string) {
  return /supabase\.co\b/i.test(url);
}

/** Where a Supabase client request should go while Railway is the database. */
export function railwayFetchPlan(url: string): "database" | "blocked" | "passthrough" {
  if (!railwayDatabaseEnabled()) return "passthrough";
  if (restSuffix(url)) return "database";
  if (isSupabaseHost(url)) return "blocked";
  return "passthrough";
}

function blockedSupabaseResponse() {
  return new Response(
    JSON.stringify({ message: "Truss reads and writes Railway. This request was not sent to Supabase." }),
    { status: 410, headers: { "content-type": "application/json" } },
  );
}

/** Sends PostgREST calls to Railway. Auth, realtime, and storage are not forwarded to Supabase. */
export const railwayRestFetch: typeof fetch = (input, init) => {
  if (!railwayDatabaseEnabled()) return fetch(input, init);
  const raw =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const suffix = restSuffix(raw);
  if (!suffix) {
    if (isSupabaseHost(raw)) return Promise.resolve(blockedSupabaseResponse());
    return fetch(input, init);
  }

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
  if (!railwayDatabaseEnabled()) return {};
  return { global: { fetch: railwayRestFetch } };
}
