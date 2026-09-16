import { NextResponse } from "next/server";
import { normalizeShareToken } from "@/lib/share";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  checkoutSessionParams,
  depositAmountFromSharedEstimate,
  dollarsToCents,
  parseCheckoutKind,
  parseOpenBalance,
  requestOrigin,
} from "@/lib/stripe-checkout";
import { isStripeConfigured, stripeForm } from "@/lib/stripe-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Card payments are not connected yet." }, { status: 400 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Could not start the card payment." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as
    | { token?: string; kind?: string }
    | null;
  const token = normalizeShareToken(body?.token);
  const kind = parseCheckoutKind(body?.kind);
  if (token.length < 6 || !kind) {
    return NextResponse.json({ error: "That payment link is not valid." }, { status: 400 });
  }

  const origin = requestOrigin(request);
  if (!origin) {
    return NextResponse.json({ error: "Could not start the card payment." }, { status: 400 });
  }

  const supabase = createAnonClient();
  let depositAmount = 0;
  if (kind === "deposit") {
    const shared = await supabase.rpc("shared_estimate", { p_token: token });
    if (shared.error || shared.data == null) {
      return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
    }
    depositAmount = depositAmountFromSharedEstimate(shared.data);
    if (depositAmount <= 0) {
      return NextResponse.json({ error: "This proposal does not have a deposit due." }, { status: 400 });
    }
  }

  const opened = await supabase.rpc("stripe_open_balance", {
    p_token: token,
    p_kind: kind,
    p_deposit_amount: depositAmount,
  });
  if (opened.error) {
    return NextResponse.json({ error: opened.error.message }, { status: 400 });
  }
  const target = parseOpenBalance(opened.data);
  if (!target.ok) {
    return NextResponse.json({ error: target.error }, { status: 400 });
  }

  const amountCents = dollarsToCents(target.amount);
  if (amountCents < 50) {
    return NextResponse.json(
      { error: kind === "deposit" ? "The deposit is already covered." : "This invoice is already paid." },
      { status: 400 },
    );
  }

  const session = await stripeForm(
    "checkout/sessions",
    checkoutSessionParams({ origin, target, token, amountCents }),
  );
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: 400 });
  }
  const url = typeof session.data.url === "string" ? session.data.url : "";
  if (!url) {
    return NextResponse.json({ error: "Stripe did not return a checkout link." }, { status: 400 });
  }
  return NextResponse.json({ url });
}
