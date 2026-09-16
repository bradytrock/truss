import { estimateTotals, fillEstimate } from "@/lib/estimate-totals";
import { billingEstimate } from "@/lib/market";
import { parseSharedEstimate } from "@/lib/share";
import { asStripeObject, stripeAmountCents, stripeString } from "@/lib/stripe-server";

export type StripeCheckoutKind = "invoice" | "deposit";

export type StripeOpenBalance = {
  ok: true;
  kind: StripeCheckoutKind;
  companyId: string;
  invoiceId: string | null;
  estimateId: string | null;
  jobId: string | null;
  amount: number;
  label: string;
  customer: string;
  sharePath: string;
};

export function parseCheckoutKind(value: unknown): StripeCheckoutKind | null {
  return value === "invoice" || value === "deposit" ? value : null;
}

export function requestOrigin(request: Request) {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ?? "";
  if (env) return env;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  if (!host) return "";
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export function dollarsToCents(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

export function centsToDollars(cents: number) {
  return Math.round(cents) / 100;
}

export function parseOpenBalance(raw: unknown): StripeOpenBalance | { ok: false; error: string } {
  const data = asStripeObject(raw);
  if (!data) return { ok: false, error: "Could not start that payment." };
  if (data.ok === false) {
    return { ok: false, error: stripeString(data.error) || "Could not start that payment." };
  }
  const kind = parseCheckoutKind(data.kind);
  const companyId = stripeString(data.companyId);
  const amount = typeof data.amount === "number" ? data.amount : Number(data.amount);
  if (!kind || !companyId || !Number.isFinite(amount)) {
    return { ok: false, error: "Could not start that payment." };
  }
  return {
    ok: true,
    kind,
    companyId,
    invoiceId: stripeString(data.invoiceId) || null,
    estimateId: stripeString(data.estimateId) || null,
    jobId: stripeString(data.jobId) || null,
    amount,
    label: stripeString(data.label) || (kind === "deposit" ? "Deposit" : "Invoice"),
    customer: stripeString(data.customer) || "Homeowner",
    sharePath: stripeString(data.sharePath) || "/",
  };
}

export function depositAmountFromSharedEstimate(raw: unknown) {
  const shared = parseSharedEstimate(raw);
  if (!shared) return 0;
  const estimate = fillEstimate(shared.estimate);
  return estimateTotals(billingEstimate(estimate, shared.market), shared.lines).deposit;
}

export function checkoutSessionParams(input: {
  origin: string;
  target: StripeOpenBalance;
  token: string;
  amountCents: number;
}) {
  const success = `${input.origin}${input.target.sharePath}?paid=1`;
  const cancel = `${input.origin}${input.target.sharePath}`;
  const params: Record<string, string> = {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(input.amountCents),
    "line_items[0][price_data][product_data][name]": input.target.label,
    success_url: success,
    cancel_url: cancel,
    "metadata[kind]": input.target.kind,
    "metadata[token]": input.token,
    "metadata[company_id]": input.target.companyId,
    "metadata[invoice_id]": input.target.invoiceId ?? "",
    "metadata[estimate_id]": input.target.estimateId ?? "",
    "metadata[job_id]": input.target.jobId ?? "",
    "payment_intent_data[metadata][kind]": input.target.kind,
    "payment_intent_data[metadata][company_id]": input.target.companyId,
    "payment_intent_data[metadata][invoice_id]": input.target.invoiceId ?? "",
    "payment_intent_data[metadata][estimate_id]": input.target.estimateId ?? "",
    "payment_intent_data[metadata][job_id]": input.target.jobId ?? "",
  };
  return params;
}

export function stripeSessionPaymentIntent(session: Record<string, unknown>) {
  const raw = session.payment_intent;
  if (typeof raw === "string") return raw;
  const obj = asStripeObject(raw);
  return obj ? stripeString(obj.id) : "";
}

export function stripeSessionAmountDollars(session: Record<string, unknown>) {
  return centsToDollars(stripeAmountCents(session.amount_total));
}
