import { NextResponse } from "next/server";
import { parseAudienceInput, previewCampaignAudience } from "@/lib/marketing/email-campaign-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Connect Supabase to preview a list from the book." }, { status: 400 });
  }
  const url = new URL(request.url);
  const audience = parseAudienceInput({
    audienceKind: url.searchParams.get("audience") || "",
    city: url.searchParams.get("city") || "",
    zip: url.searchParams.get("zip") || "",
    includePunch: url.searchParams.get("includePunch") === "1",
  });
  if ("error" in audience) {
    return NextResponse.json({ error: audience.error }, { status: 400 });
  }
  const result = await previewCampaignAudience({
    audienceKind: audience.audienceKind,
    filter: audience.filter,
  });
  if ("error" in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
