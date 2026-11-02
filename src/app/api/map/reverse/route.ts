import { NextResponse } from "next/server";
import { reverseGeocode } from "@/lib/geocode-server";
import { requireMapSeat } from "@/lib/map-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireMapSeat();
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "That point is off the map." }, { status: 400 });
  }
  const hit = await reverseGeocode(lat, lng);
  if (!hit) return NextResponse.json({ error: "No address came back for that point." }, { status: 404 });
  return NextResponse.json(hit);
}
