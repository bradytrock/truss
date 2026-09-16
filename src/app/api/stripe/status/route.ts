import { NextResponse } from "next/server";
import { normalizeShareToken } from "@/lib/share";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isStripeConfigured } from "@/lib/stripe-server";
import { parseStripeStatus } from "@/lib/stripe-company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const host = isStripeConfigured();
  const token = normalizeShareToken(new URL(request.url).searchParams.get("token"));
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ enabled: host });
  }

  if (token.length >= 6) {
    const supabase = createAnonClient();
    await supabase.rpc("stripe_apply_company_revokes");
    const enabled = await supabase.rpc("stripe_enabled_for_token", { p_token: token });
    return NextResponse.json({ enabled: host || enabled.data === true });
  }

  try {
    const supabase = await createClient();
    const status = await supabase.rpc("stripe_company_status");
    const parsed = parseStripeStatus(status.data);
    return NextResponse.json({ enabled: host || parsed.connected });
  } catch {
    return NextResponse.json({ enabled: host });
  }
}
