import { createHmac, timingSafeEqual } from "node:crypto";

export function stripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY?.trim() ?? "";
}

export function stripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
}

export function isStripeConfigured() {
  return Boolean(stripeSecretKey());
}

export async function stripeForm(
  path: string,
  params: Record<string, string>,
  secret = stripeSecretKey(),
) {
  const key = secret.trim();
  if (!key) return { ok: false as const, error: "Stripe is not connected." };
  const body = new URLSearchParams(params);
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const err = data.error;
    const message =
      err && typeof err === "object" && "message" in err && typeof err.message === "string"
        ? err.message
        : "Stripe could not start that payment.";
    return { ok: false as const, error: message };
  }
  return { ok: true as const, data };
}

export function verifyStripeSignature(payload: string, header: string, secret: string) {
  const parts = header.split(",").map((item) => item.trim());
  const timestamp = parts.find((item) => item.startsWith("t="))?.slice(2) ?? "";
  const signatures = parts.filter((item) => item.startsWith("v1=")).map((item) => item.slice(3));
  if (!timestamp || signatures.length === 0) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(Number(timestamp)) || age > 60 * 5) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return signatures.some((signature) => {
    try {
      const left = Buffer.from(expected, "utf8");
      const right = Buffer.from(signature, "utf8");
      return left.length === right.length && timingSafeEqual(left, right);
    } catch {
      return false;
    }
  });
}

export function asStripeObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function stripeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function stripeAmountCents(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
