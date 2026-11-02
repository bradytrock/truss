import { NextResponse } from "next/server";
import { requireMapSeat } from "@/lib/map-auth";
import { loadHailCatalog } from "@/lib/weather/swath-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireMapSeat();
  if ("error" in auth) return auth.error;
  try {
    const catalog = await loadHailCatalog(auth.supabase);
    return NextResponse.json(catalog);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The hail swaths did not load.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
