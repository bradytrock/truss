import { NextResponse } from "next/server";
import { notifyAssignedLeadFromRequest } from "@/lib/lead-assign-email-server";
import { isResendConfigured } from "@/lib/resend-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ configured: isResendConfigured() });
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Could not read that request." }, { status: 400 });
  }

  const result = await notifyAssignedLeadFromRequest(body);
  const { status, ...payload } = result;
  return NextResponse.json(payload, { status });
}
