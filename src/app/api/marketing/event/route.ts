import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { token?: string; kind?: string }
    | null;
  const token = body?.token?.trim();
  const kind = body?.kind?.trim();
  if (!token || !kind) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, local: true });
  }
  const supabase = await createClient();
  await supabase.rpc("record_marketing_event", {
    p_token: token,
    p_kind: kind,
  });
  return NextResponse.json({ ok: true });
}
