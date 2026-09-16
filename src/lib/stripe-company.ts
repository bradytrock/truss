export function looksLikeStripeSecretKey(value: string) {
  const key = value.trim();
  return key.startsWith("sk_test_") || key.startsWith("sk_live_") ? key.length >= 20 : false;
}

export function looksLikeStripeWebhookSecret(value: string) {
  const key = value.trim();
  return key.startsWith("whsec_") && key.length >= 16;
}

export type StripeCompanyStatus = {
  connected: boolean;
  revokeAt: string | null;
  revokeRequestedBy: string;
  connectedAt: string | null;
  webhookToken: string;
  error?: string;
};

export function parseStripeStatus(raw: unknown): StripeCompanyStatus {
  const empty: StripeCompanyStatus = {
    connected: false,
    revokeAt: null,
    revokeRequestedBy: "",
    connectedAt: null,
    webhookToken: "",
  };
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!data) return empty;
  if (data.ok === false) {
    return {
      ...empty,
      error: typeof data.error === "string" ? data.error : "Could not load Stripe settings.",
    };
  }
  return {
    connected: Boolean(data.connected),
    revokeAt: typeof data.revokeAt === "string" && data.revokeAt ? data.revokeAt : null,
    revokeRequestedBy: typeof data.revokeRequestedBy === "string" ? data.revokeRequestedBy : "",
    connectedAt: typeof data.connectedAt === "string" && data.connectedAt ? data.connectedAt : null,
    webhookToken: typeof data.webhookToken === "string" ? data.webhookToken.trim() : "",
  };
}

export function companyStripeWebhookUrl(origin: string, token: string) {
  const base = origin.trim().replace(/\/+$/, "");
  const webhookToken = token.trim();
  if (!base || webhookToken.length < 24) return "";
  return `${base}/api/stripe/webhook/${encodeURIComponent(webhookToken)}`;
}

export function revokeIsPending(revokeAt: string | null, now = Date.now()) {
  if (!revokeAt) return false;
  const stamp = new Date(revokeAt).getTime();
  return Number.isFinite(stamp) && stamp > now;
}
