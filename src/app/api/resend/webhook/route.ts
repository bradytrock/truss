import { NextResponse } from "next/server";
import { applyResendDeliveryEvent, emailDeliveryServiceClient } from "@/lib/email-delivery-server";
import { emailStatusFromEventType } from "@/lib/email-status";
import { verifyResendWebhook } from "@/lib/email-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function header(request: Request, name: string, alias: string) {
  return request.headers.get(name)?.trim() || request.headers.get(alias)?.trim() || "";
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret) {
    return NextResponse.json({ error: "RESEND_WEBHOOK_SECRET is not set." }, { status: 503 });
  }
  const payload = await request.text();
  const verified = verifyResendWebhook({
    payload,
    secret,
    id: header(request, "svix-id", "webhook-id"),
    timestamp: header(request, "svix-timestamp", "webhook-timestamp"),
    signature: header(request, "svix-signature", "webhook-signature"),
  });
  if (!verified) return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });

  let event: { type?: unknown; data?: { email_id?: unknown } } = {};
  try {
    event = JSON.parse(payload) as { type?: unknown; data?: { email_id?: unknown } };
  } catch {
    return NextResponse.json({ error: "Could not read that event." }, { status: 400 });
  }
  const status = emailStatusFromEventType(typeof event.type === "string" ? event.type : "");
  const emailId = typeof event.data?.email_id === "string" ? event.data.email_id : "";
  if (!status || !emailId) return NextResponse.json({ ok: true, ignored: true });

  const supabase = emailDeliveryServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });
  }
  const updated = await applyResendDeliveryEvent(supabase, emailId, status);
  return NextResponse.json({ ok: true, updated });
}
