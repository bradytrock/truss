/** Browser data calls go to this app. The server sends them to Railway when that database is on. */
export const TRUSS_DB_COOKIE = "truss-db";

export function railwayRestPort() {
  return process.env.RAILWAY_REST_PORT?.trim() || "3210";
}

function runtimeEnv(name: string) {
  return process.env[name];
}

/** Set by the server process after the Railway API is listening. */
export function railwayDatabaseActive() {
  return runtimeEnv("TRUSS_RAILWAY_DATABASE") === "1" && process.env.NEXT_PUBLIC_USE_RAILWAY_DATABASE !== "0";
}

/**
 * Browser table and RPC calls always stay on this app, so a production host can
 * choose Railway at runtime. Server calls use Railway only after the API is up.
 */
export function useRailwayDatabase() {
  if (process.env.NEXT_PUBLIC_USE_RAILWAY_DATABASE === "0") return false;
  if (typeof window !== "undefined") return true;
  return railwayDatabaseActive();
}

function isJwt(value: string) {
  return value.split(".").length === 3;
}

export function restSuffix(url: string) {
  const at = url.indexOf("/rest/v1");
  if (at === -1) return null;
  return url.slice(at + "/rest/v1".length) || "/";
}

export function restApiTarget(url: string, where: "browser" | "server", active: boolean) {
  if (!active) return null;
  const suffix = restSuffix(url);
  if (!suffix) return null;
  if (where === "browser") return `/rest/v1${suffix}`;
  return `http://127.0.0.1:${railwayRestPort()}${suffix}`;
}

function withoutPublishableBearer(headers: Headers) {
  const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (bearer && !isJwt(bearer)) headers.delete("authorization");
  return headers;
}

function requestHeaders(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (!init?.headers && input instanceof Request) {
    input.headers.forEach((value, key) => headers.set(key, value));
  }
  return headers;
}

/** Sends PostgREST calls to this app (browser) or the local Railway API (server). Auth stays put. */
export const railwayRestFetch: typeof fetch = (input, init) => {
  const raw =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const where = typeof window === "undefined" ? "server" : "browser";
  const target = restApiTarget(raw, where, useRailwayDatabase());
  if (!target) return fetch(input, init);

  const headers = requestHeaders(input, init);
  if (where === "server") withoutPublishableBearer(headers);
  return fetch(target, { ...init, headers });
};

export function railwayClientOptions(): { global?: { fetch: typeof fetch } } {
  if (!useRailwayDatabase()) return {};
  return { global: { fetch: railwayRestFetch } };
}

export function browserUsesRailwayDatabase() {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((part) => part.trim() === `${TRUSS_DB_COOKIE}=railway`);
}
