import { NextResponse } from "next/server";
import { requireMapSeat } from "@/lib/map-auth";
import { renderCropPng } from "@/lib/weather/grib";
import { rotationVisible, swathColor } from "@/lib/weather/hail";
import { loadMeshCrop, loadRotationCrop } from "@/lib/weather/picture";
import type { BBox } from "@/lib/weather/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await requireMapSeat();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const bounds = readBounds(url);
  if (!bounds) return NextResponse.json({ error: "Need a map box." }, { status: 400 });
  const product = url.searchParams.get("product") === "rotation" ? "rotation" : "mesh";
  try {
    const grid = product === "rotation" ? await loadRotationCrop(bounds) : await loadMeshCrop(bounds);
    const png = renderCropPng(grid, (value) => {
      if (product === "rotation") return rotationVisible(value) ? [127, 29, 29, 180] : null;
      return swathColor(value);
    });
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The hail swath did not load.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function readBounds(url: URL): BBox | null {
  const west = Number(url.searchParams.get("west"));
  const south = Number(url.searchParams.get("south"));
  const east = Number(url.searchParams.get("east"));
  const north = Number(url.searchParams.get("north"));
  if (![west, south, east, north].every(Number.isFinite)) return null;
  if (east <= west || north <= south) return null;
  if (east - west > 30 || north - south > 30) return null;
  return { west, south, east, north };
}
