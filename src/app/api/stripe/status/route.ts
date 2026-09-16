import { NextResponse } from "next/server";
import { isStripeConfigured } from "@/lib/stripe-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ enabled: isStripeConfigured() });
}
