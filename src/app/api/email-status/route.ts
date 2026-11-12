import { NextResponse } from "next/server";
import { refreshEmailActivities } from "@/lib/email-delivery-server";
import { readSessionUser } from "@/lib/session-user";
import { createClient } from "@/lib/supabase/server";
import { looksLikeUuid } from "@/lib/supabase/schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await readSessionUser(supabase);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: { activityIds?: unknown } = {};
  try {
    body = (await request.json()) as { activityIds?: unknown };
  } catch {
    return NextResponse.json({ error: "Could not read that request." }, { status: 400 });
  }
  const activityIds = Array.isArray(body.activityIds)
    ? body.activityIds.filter((id): id is string => typeof id === "string" && looksLikeUuid(id))
    : [];
  if (!activityIds.length) return NextResponse.json({ updates: [], pending: false });

  const result = await refreshEmailActivities(supabase, activityIds);
  return NextResponse.json(result);
}
