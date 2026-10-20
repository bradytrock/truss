import { NextResponse } from "next/server";
import { sendTestMarketingEmail } from "@/lib/marketing/email-campaign-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Connect Supabase before sending a test." }, { status: 400 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Could not read that request." }, { status: 400 });
  }
  const result = await sendTestMarketingEmail({
    subject: typeof body.subject === "string" ? body.subject : "",
    bodyText: typeof body.body === "string" ? body.body : "",
    html: typeof body.html === "string" ? body.html.slice(0, 200_000) : "",
  });
  if ("error" in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
