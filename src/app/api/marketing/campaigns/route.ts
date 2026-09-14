import { NextResponse } from "next/server";
import { listEmailCampaigns, parseAudienceInput, sendEmailCampaign } from "@/lib/marketing/email-campaign-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ campaigns: [], configured: false });
  }
  const result = await listEmailCampaigns();
  if ("error" in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Connect Supabase before sending a campaign." }, { status: 400 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Could not read that request." }, { status: 400 });
  }

  const audience = parseAudienceInput(body);
  if ("error" in audience) {
    return NextResponse.json({ error: audience.error }, { status: 400 });
  }

  const contactIds = Array.isArray(body.contactIds)
    ? body.contactIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  const result = await sendEmailCampaign({
    name: typeof body.name === "string" ? body.name : "",
    audienceKind: audience.audienceKind,
    filter: audience.filter,
    subject: typeof body.subject === "string" ? body.subject : "",
    bodyText: typeof body.body === "string" ? body.body : "",
    contactIds,
  });
  if ("error" in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
