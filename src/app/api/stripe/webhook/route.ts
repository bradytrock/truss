import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  stripeSessionAmountDollars,
  stripeSessionPaymentIntent,
} from "@/lib/stripe-checkout";
import {
  asStripeObject,
  stripeString,
  stripeWebhookSecret,
  verifyStripeSignature,
} from "@/lib/stripe-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 500 });
  }

  const payload = await request.text();
  const header = request.headers.get("stripe-signature") ?? "";
  const hostSecret = stripeWebhookSecret();
  const hostOk = Boolean(hostSecret) && verifyStripeSignature(payload, header, hostSecret);
  const supabase = createAnonClient();
  await supabase.rpc("stripe_apply_company_revokes");
  if (!hostOk) {
    const matched = await supabase.rpc("stripe_match_webhook", {
      p_payload: payload,
      p_header: header,
    });
    const row = asStripeObject(matched.data);
    if (matched.error || row?.ok !== true) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
  const event = asStripeObject(parsed);
  const type = event ? stripeString(event.type) : "";
  if (
    type !== "checkout.session.completed" &&
    type !== "checkout.session.async_payment_succeeded"
  ) {
    return NextResponse.json({ ok: true, ignored: type });
  }

  const session = event ? asStripeObject(event.data) : null;
  const object = session ? asStripeObject(session.object) : null;
  if (!object) {
    return NextResponse.json({ error: "Missing checkout session." }, { status: 400 });
  }

  const paymentStatus = stripeString(object.payment_status);
  if (paymentStatus && paymentStatus !== "paid" && paymentStatus !== "no_payment_required") {
    return NextResponse.json({ ok: true, skipped: paymentStatus });
  }

  const metadata = asStripeObject(object.metadata) ?? {};
  const paymentIntent = stripeSessionPaymentIntent(object);
  const sessionId = stripeString(object.id);
  const amount = stripeSessionAmountDollars(object);
  if (!paymentIntent || !sessionId || amount <= 0) {
    return NextResponse.json({ error: "Incomplete Stripe session." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("stripe_record_pending_payment", {
    p_company_id: asUuid(metadata.company_id),
    p_invoice_id: asUuid(metadata.invoice_id),
    p_estimate_id: asUuid(metadata.estimate_id),
    p_job_id: asUuid(metadata.job_id),
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const row = asStripeObject(data);
  if (row?.ok === false) {
    return NextResponse.json({ error: stripeString(row.error) || "Could not log payment." }, { status: 400 });
  }
  return NextResponse.json(data ?? { ok: true });
}

function asUuid(value: unknown) {
  const text = stripeString(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}
