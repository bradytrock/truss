import { NextResponse } from "next/server";
import { suggestAddresses } from "@/lib/address-suggest-server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireUser() {
  if (!isSupabaseConfigured()) return true;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to look up addresses." }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const city = url.searchParams.get("city")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";

  try {
    const suggestions = await suggestAddresses({ query, city, state });
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ error: "Could not look up that address." }, { status: 502 });
  }
}
