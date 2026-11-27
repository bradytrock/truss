/**
 * Link helpers with no app imports, so the node tests and both share modules can use them.
 * `share.ts` and `share-text.ts` re-export everything here.
 */

export type ShareKind = "e" | "i" | "p" | "f" | "q" | "c";

/**
 * The homeowner application lives at the short root path (`/q/8Fk2Qx`) so the link fits in a
 * text the way it is shown to the homeowner. Every other share keeps `/share/<kind>/<token>`.
 */
export function sharePath(kind: ShareKind, token: string) {
  return kind === "q" ? `/q/${token}` : `/share/${kind}/${token}`;
}

export function shareUrl(kind: ShareKind, token: string, origin = "") {
  const path = sharePath(kind, token);
  if (origin) return `${origin.replace(/\/+$/, "")}${path}`;
  if (typeof window !== "undefined") return `${window.location.origin}${path}`;
  return path;
}

const APPLICATION_TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export const APPLICATION_TOKEN_LENGTH = 8;

/**
 * Short code for the homeowner link, e.g. `8Fk2Qx7m`. No 0/O/1/l/I so it can be read off a
 * phone; the application also sits behind the property ZIP, so the code does not stand alone.
 */
export function newApplicationToken() {
  const bytes = new Uint8Array(APPLICATION_TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => APPLICATION_TOKEN_ALPHABET[byte % APPLICATION_TOKEN_ALPHABET.length]).join("");
}

export function isApplicationToken(value: string) {
  return /^[A-Za-z0-9]{6,64}$/.test(value);
}

/**
 * How a link reads in a text or on screen: `theroofingcrm.com/q/8Fk2Qx7m`. Drops the scheme,
 * `www.`, and a trailing slash. Phones still make it tappable.
 */
export function displayShareLink(url: string) {
  return url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
}

/** Only links back to this app, on a share path, may be texted or emailed from the share routes. */
export function shareUrlAllowed(url: string, origin: string, configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL) {
  try {
    const parsed = new URL(url);
    const allowed = new Set<string>();
    try {
      allowed.add(new URL(origin).origin);
    } catch {
      /* ignore */
    }
    const configured = configuredAppUrl?.trim();
    if (configured) {
      try {
        allowed.add(new URL(configured).origin);
      } catch {
        /* ignore */
      }
    }
    if (!allowed.has(parsed.origin)) return false;
    return /^\/share\/[eipq]\/[A-Za-z0-9_-]+\/?$/.test(parsed.pathname) || /^\/q\/[A-Za-z0-9]+\/?$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * The homeowner application link is written the way it reads on a phone
 * (`theroofingcrm.com/q/8Fk2Qx7m`), so a message carries the link when it has either the
 * full URL or that short form.
 */
export function messageCarriesLink(content: string, url: string) {
  if (!url) return false;
  if (content.includes(url)) return true;
  const short = displayShareLink(url);
  return short.length > 0 && content.includes(short);
}
