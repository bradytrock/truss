import { NextResponse } from "next/server";
import { loadProfileCompany } from "@/lib/eagleview-server";
import { MYCRMSIM_CHANNEL_LABELS } from "@/lib/mycrmsim";
import { mycrmsimStatusForCompany, sendCompanyText } from "@/lib/mycrmsim-server";
import { looksLikePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { profile } = await loadProfileCompany(supabase);
  if (!profile) {
    return NextResponse.json({ configured: false, channel: "sms" });
  }
  const status = await mycrmsimStatusForCompany(supabase, profile.company_id);
  return NextResponse.json({
    configured: status.configured,
    channel: status.channel,
    channelLabel: MYCRMSIM_CHANNEL_LABELS[status.channel],
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { user, profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile || !user) {
    return NextResponse.json({ error: authError || "Sign in to send a text." }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Could not read that request." }, { status: 400 });
  }

  const to = typeof body.to === "string" ? body.to : "";
  const content = typeof body.content === "string" ? body.content : "";
  if (!looksLikePhone(to)) {
    return NextResponse.json({ error: "Enter a valid mobile number." }, { status: 400 });
  }
  if (!content.trim()) {
    return NextResponse.json({ error: "Write a message before sending." }, { status: 400 });
  }

  try {
    const result = await sendCompanyText({
      supabase,
      companyId: profile.company_id,
      userId: profile.staff_id || user.id,
      to,
      content,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      mocked: result.mocked,
      configured: !result.mocked,
      to: result.to,
      handle: result.handle,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not reach myCRMSIM." },
      { status: 502 },
    );
  }
}
