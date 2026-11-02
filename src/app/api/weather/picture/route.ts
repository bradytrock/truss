import { NextResponse } from "next/server";
import { requireMapSeat } from "@/lib/map-auth";
import { buildStormLayers } from "@/lib/weather/picture";
import type { StormPoint } from "@/lib/weather/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireMapSeat();
  if ("error" in auth) return auth.error;

  let body: { points?: unknown; states?: unknown } = {};
  try {
    body = (await request.json()) as { points?: unknown; states?: unknown };
  } catch {
    body = {};
  }
  const points = Array.isArray(body.points) ? body.points.flatMap(readPoint) : [];
  const states = Array.isArray(body.states) ? body.states.filter((state): state is string => typeof state === "string") : [];
  try {
    const picture = await buildStormLayers(points, states);
    return NextResponse.json(picture);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The storm picture did not load.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function readPoint(value: unknown): StormPoint[] {
  if (!value || typeof value !== "object") return [];
  const row = value as { id?: unknown; lat?: unknown; lng?: unknown; state?: unknown };
  const lat = typeof row.lat === "number" ? row.lat : Number.NaN;
  const lng = typeof row.lng === "number" ? row.lng : Number.NaN;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  return [{ id, lat, lng, state: typeof row.state === "string" ? row.state : "" }];
}
