import { createAnonClient } from "@/lib/supabase/anon";
import {
  stripeSessionAmountDollars,
  stripeSessionPaymentIntent,
} from "@/lib/stripe-checkout";
import { asStripeObject, stripeString } from "@/lib/stripe-server";

export function asStripeUuid(value: unknown) {
  const text = stripeString(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

export async function recordStripeCheckoutPayment(input: {
  payload: string;
  companyId: string;
}) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.payload) as unknown;
  } catch {
    return { status: 400 as const, body: { error: "Invalid payload." } };
  }

  const event = asStripeObject(parsed);
  const type = event ? stripeString(event.type) : "";
  if (type !== "checkout.session.completed" && type !== "checkout.session.async_payment_succeeded") {
    return { status: 200 as const, body: { ok: true, ignored: type } };
  }

  const session = event ? asStripeObject(event.data) : null;
  const object = session ? asStripeObject(session.object) : null;
  if (!object) {
    return { status: 400 as const, body: { error: "Missing checkout session." } };
  }

  const paymentStatus = stripeString(object.payment_status);
  if (paymentStatus && paymentStatus !== "paid" && paymentStatus !== "no_payment_required") {
    return { status: 200 as const, body: { ok: true, skipped: paymentStatus } };
  }

  const metadata = asStripeObject(object.metadata) ?? {};
  const paymentIntent = stripeSessionPaymentIntent(object);
  const sessionId = stripeString(object.id);
  const amount = stripeSessionAmountDollars(object);
  if (!paymentIntent || !sessionId || amount <= 0) {
    return { status: 400 as const, body: { error: "Incomplete Stripe session." } };
  }

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("stripe_record_pending_payment", {
    p_company_id: input.companyId,
    p_invoice_id: asStripeUuid(metadata.invoice_id),
    p_estimate_id: asStripeUuid(metadata.estimate_id),
    p_job_id: asStripeUuid(metadata.job_id),
    p_amount: amount,
    p_paid_at: stripeString(object.created)
      ? new Date(Number(object.created) * 1000).toISOString()
      : new Date().toISOString(),
    p_payment_intent: paymentIntent,
    p_checkout_session: sessionId,
    p_reference: paymentIntent,
  });

  if (error) {
    console.error("[stripe] record pending", error.message);
    return { status: 500 as const, body: { error: error.message } };
  }
  const row = asStripeObject(data);
  if (row?.ok === false) {
    return {
      status: 400 as const,
      body: { error: stripeString(row.error) || "Could not log payment." },
    };
  }
  return { status: 200 as const, body: data ?? { ok: true } };
}
