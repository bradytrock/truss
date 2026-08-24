import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GCAL_COOKIE, GCAL_COOKIE_LEGACY } from "@/lib/google-calendar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function POST(request: Request) {
  const body = (await request.json()) as { staffId?: string };
  const staffId = body.staffId;
  if (!staffId) {
    return NextResponse.json({ error: "Missing staffId." }, { status: 400 });
  }

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { error } = await supabase.rpc("disconnect_google_calendar", { p_staff_id: staffId });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const store = await cookies();
  for (const name of [GCAL_COOKIE, GCAL_COOKIE_LEGACY]) {
    const raw = store.get(name)?.value;
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as { staffId?: string };
      if (parsed.staffId === staffId) store.delete(name);
    } catch {
      store.delete(name);
    }
  }
  return NextResponse.json({ ok: true });
}
