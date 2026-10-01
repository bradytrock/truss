import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sharedWebhookRejected() {
  return NextResponse.json(
    {
      error: "Use this company's webhook URL from Settings → Photon. A shared webhook cannot receive texts.",
    },
    { status: 400 },
  );
}

export async function GET() {
  return sharedWebhookRejected();
}

export async function POST() {
  return sharedWebhookRejected();
}
