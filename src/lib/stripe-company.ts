export function looksLikeStripeSecretKey(value: string) {
  const key = value.trim();
  return key.startsWith("sk_test_") || key.startsWith("sk_live_") ? key.length >= 20 : false;
}

export function looksLikeStripeWebhookSecret(value: string) {
  const key = value.trim();
  return key.startsWith("whsec_") && key.length >= 16;
}

export function parseStripeStatus(raw: unknown): {
  connected: boolean;
  revokeAt: string | null;
  revokeRequestedBy: string;
  connectedAt: string | null;
  error?: string;
} {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!data) return { connected: false, revokeAt: null, revokeRequestedBy: "", connectedAt: null };
  if (data.ok === false) {
    return {
      connected: false,
      revokeAt: null,
      revokeRequestedBy: "",
      connectedAt: null,
      error: typeof data.error === "string" ? data.error : "Could not load Stripe settings.",
    };
  }
  return {
    connected: Boolean(data.connected),
    revokeAt: typeof data.revokeAt === "string" && data.revokeAt ? data.revokeAt : null,
    revokeRequestedBy: typeof data.revokeRequestedBy === "string" ? data.revokeRequestedBy : "",
    connectedAt: typeof data.connectedAt === "string" && data.connectedAt ? data.connectedAt : null,
  };
}

export function revokeIsPending(revokeAt: string | null, now = Date.now()) {
  if (!revokeAt) return false;
  const stamp = new Date(revokeAt).getTime();
  return Number.isFinite(stamp) && stamp > now;
}
