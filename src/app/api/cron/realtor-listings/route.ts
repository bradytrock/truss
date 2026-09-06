import { NextResponse } from "next/server";
import { runRealtorListingBrowse } from "@/lib/realtor-listings-browse";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim() ?? "";
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

async function staffAuthorized() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const cronOk = cronAuthorized(request);
  const staffOk = cronOk ? false : await staffAuthorized();
  if (!cronOk && !staffOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const contactId = url.searchParams.get("contactId")?.trim() || undefined;
  try {
    const summary = await runRealtorListingBrowse({
      contactId,
      limit: contactId ? 1 : 40,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[cron/realtor-listings]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Listing browse failed.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
