import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { recordStripeCheckoutPayment } from "@/lib/stripe-webhook";
import { asStripeObject, stripeString } from "@/lib/stripe-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 500 });
  }

  const { token } = await context.params;
  const payload = await request.text();
  const header = request.headers.get("stripe-signature") ?? "";
  const supabase = createAnonClient();
  const verified = await supabase.rpc("stripe_verify_company_webhook", {
    p_token: token,
    p_payload: payload,
    p_header: header,
  });
  const row = asStripeObject(verified.data);
  const companyId = row?.ok === true ? stripeString(row.companyId) : "";
  if (verified.error || !companyId) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const recorded = await recordStripeCheckoutPayment({ payload, companyId });
  return NextResponse.json(recorded.body, { status: recorded.status });
}
