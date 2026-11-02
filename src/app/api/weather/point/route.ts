import { NextResponse } from "next/server";
import { requireMapSeat } from "@/lib/map-auth";
import { lookupHailPoint } from "@/lib/weather/swath-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireMapSeat();
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const sinceDays = clampDays(url.searchParams.get("since"));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "That point is off the map." }, { status: 400 });
  }
  try {
    const result = await lookupHailPoint(auth.supabase, lat, lng, sinceDays, auth.companyId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The hail lookup did not finish.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function clampDays(value: string | null) {
  const days = Number(value ?? 90);
  if (!Number.isFinite(days)) return 90;
  return Math.min(3650, Math.max(1, Math.round(days)));
}
