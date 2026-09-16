import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Use this company’s webhook URL from Settings → Stripe. A shared webhook cannot receive events.",
    },
    { status: 400 },
  );
}
