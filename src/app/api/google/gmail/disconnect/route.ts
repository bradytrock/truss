import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GMAIL_COOKIE } from "@/lib/google-gmail";
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
    const { error } = await supabase.rpc("disconnect_gmail", { p_staff_id: staffId });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const store = await cookies();
  const raw = store.get(GMAIL_COOKIE)?.value;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { staffId?: string };
      if (parsed.staffId === staffId) store.delete(GMAIL_COOKIE);
    } catch {
      store.delete(GMAIL_COOKIE);
    }
  }
  return NextResponse.json({ ok: true });
}
