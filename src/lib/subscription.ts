/** Marketing site where an unpaid company books a walkthrough. */
export const DEMO_SCHEDULE_URL = "https://theroofingcrm.com/";

const LEGAL_PATHS = ["/privacy", "/terms", "/cookies"];

export function companySubscriptionActive(row: unknown) {
  if (!row || typeof row !== "object") return false;
  const record = row as Record<string, unknown>;
  if (!("subscription_active" in record)) return true;
  return record.subscription_active === true;
}

function normalizePath(pathname: string) {
  return (pathname.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
}

function isPublicCardPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[1] !== "card") return false;
  if (parts.length === 3) return true;
  return parts.length === 4 && (parts[3] === "opengraph-image" || parts[3] === "twitter-image");
}

export function isSubscriptionExemptPath(pathname: string) {
  const path = normalizePath(pathname);
  if (path.startsWith("/login") || path.startsWith("/signup") || path.startsWith("/auth")) return true;
  if (path.startsWith("/unsubscribe")) return true;
  if (LEGAL_PATHS.some((item) => path === item || path.startsWith(`${item}/`))) return true;
  if (isPublicCardPath(path) || isPublicCardPath(`${path}/`)) return true;
  if (
    path.startsWith("/share") ||
    path.startsWith("/portal") ||
    path.startsWith("/realtor-portal")
  ) {
    return true;
  }
  if (
    path.startsWith("/api/share") ||
    path.startsWith("/api/portal") ||
    path.startsWith("/api/realtor-portal") ||
    path.startsWith("/api/cron") ||
    path.startsWith("/api/qbwc") ||
    path.startsWith("/api/voice") ||
    path.startsWith("/api/stripe/webhook") ||
    path.startsWith("/api/eagleview/webhook") ||
    path.startsWith("/api/messages/inbound") ||
    path.startsWith("/api/marketing/unsubscribe") ||
    path.startsWith("/api/marketing/event") ||
    path.startsWith("/api/cards/event")
  ) {
    return true;
  }
  return false;
}

export function shouldForceDemo(input: { signedIn: boolean; pathname: string; subscriptionActive: boolean }) {
  if (!input.signedIn) return false;
  if (isSubscriptionExemptPath(input.pathname)) return false;
  return !input.subscriptionActive;
}

export function subscriptionActiveFromRpc(result: {
  data: unknown;
  error: { message?: string } | null;
}) {
  if (result.error) return true;
  return result.data === true;
}
