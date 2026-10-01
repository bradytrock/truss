/**
 * Reads the Supabase auth cookie without calling the Auth server.
 * The proxy uses this to skip a network round trip while the access token is
 * still comfortably inside its lifetime.
 */

export const GATE_COOKIE = "truss-gate";
/** How long a confirmed, subscribed session can skip Auth and the subscription RPC. */
export const GATE_COOKIE_MAX_AGE = 120;
/** Refresh before the access token expires so the session does not die mid-click. */
export const TOKEN_REFRESH_LEEWAY_SEC = 90;

type CookieLike = { name: string; value: string };

export type AuthCookieSession = {
  present: boolean;
  /** Access token exists and is outside the refresh window. */
  fresh: boolean;
  expiresAt: number | null;
};

export function projectRefFromSupabaseUrl(url: string) {
  try {
    return new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

function decodeCookiePayload(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  if (value.startsWith("{")) return value;
  const encoded = value.startsWith("base64-") ? value.slice("base64-".length) : value;
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    if (decoded.trim().startsWith("{")) return decoded;
  } catch {
    // Not a base64url session payload.
  }
  return value;
}

function readCookieValue(cookies: CookieLike[], key: string) {
  const exact = cookies.find((cookie) => cookie.name === key)?.value;
  if (exact) return exact;
  const parts: string[] = [];
  for (let index = 0; ; index += 1) {
    const chunk = cookies.find((cookie) => cookie.name === `${key}.${index}`)?.value;
    if (!chunk) break;
    parts.push(chunk);
  }
  return parts.join("");
}

function storageKey(cookies: CookieLike[], projectRef: string) {
  if (projectRef) {
    const key = `sb-${projectRef}-auth-token`;
    if (readCookieValue(cookies, key)) return key;
  }
  const found = cookies.find((cookie) => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name));
  if (!found) return "";
  return found.name.replace(/\.\d+$/, "");
}

function expiresAtFromSession(raw: string) {
  const decoded = decodeCookiePayload(raw);
  try {
    const session = JSON.parse(decoded) as { expires_at?: unknown; access_token?: unknown };
    if (typeof session.expires_at === "number" && Number.isFinite(session.expires_at)) {
      return session.expires_at;
    }
    if (typeof session.access_token === "string") {
      const payload = session.access_token.split(".")[1];
      if (!payload) return null;
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
      if (typeof claims.exp === "number" && Number.isFinite(claims.exp)) return claims.exp;
    }
  } catch {
    return null;
  }
  return null;
}

export function readAuthCookieSession(
  cookies: CookieLike[],
  projectRef: string,
  nowSec: number,
): AuthCookieSession {
  const key = storageKey(cookies, projectRef);
  if (!key) return { present: false, fresh: false, expiresAt: null };
  const raw = readCookieValue(cookies, key);
  if (!raw) return { present: false, fresh: false, expiresAt: null };
  const expiresAt = expiresAtFromSession(raw);
  if (expiresAt == null) return { present: true, fresh: false, expiresAt: null };
  return {
    present: true,
    fresh: expiresAt - nowSec > TOKEN_REFRESH_LEEWAY_SEC,
    expiresAt,
  };
}
