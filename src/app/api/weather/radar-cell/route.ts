import { NextResponse } from "next/server";
import { requireMapSeat } from "@/lib/map-auth";
import { hailChanceLabel, nearestRadarSite, radarActive, radarCategory, dbzFromRgba } from "@/lib/weather/hail-point";
import { latLngToTilePixel, readPngPixel } from "@/lib/weather/radar-png";
import { RADAR_TILE_HOST, radarProduct } from "@/lib/weather-radar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tiles = new Map<string, { at: number; bytes: Uint8Array }>();
const TILE_TTL_MS = 60_000;

/**
 * Samples the IEM NEXRAD tile under the click and maps the color to dBZ.
 * TODO: replace this with a real reflectivity grid (MRMS or an IEM value raster)
 * so motion, echo top, and hail probability come from the volume, not the paint.
 */
export async function GET(request: Request) {
  const auth = await requireMapSeat();
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const zoom = Number(url.searchParams.get("zoom") ?? 7);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "That point is off the map." }, { status: 400 });
  }
  const tile = latLngToTilePixel(lat, lng, zoom);
  try {
    const bytes = await loadTile(tile.z, tile.tileX, tile.tileY);
    const pixel = readPngPixel(bytes, tile.px, tile.py);
    const dbz = pixel ? dbzFromRgba(pixel.r, pixel.g, pixel.b, pixel.a) : null;
    if (!radarActive(dbz) || dbz == null) {
      return NextResponse.json({ active: false, approximate: true, radarSite: nearestRadarSite(lat, lng) });
    }
    return NextResponse.json({
      active: true,
      approximate: true,
      dbz,
      category: radarCategory(dbz),
      hailChance: hailChanceLabel(dbz),
      radarSite: nearestRadarSite(lat, lng),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The radar tile did not load.";
    return NextResponse.json({ active: false, approximate: true, error: message });
  }
}

async function loadTile(z: number, x: number, y: number) {
  const key = `${z}/${x}/${y}`;
  const cached = tiles.get(key);
  if (cached && Date.now() - cached.at < TILE_TTL_MS) return cached.bytes;
  const url = `${RADAR_TILE_HOST}/${radarProduct(0)}/${z}/${x}/${y}.png`;
  const response = await fetch(url, {
    headers: { "User-Agent": "TheRoofingCRM (https://myroofingtools.com; storm desk)" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Radar tile ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  tiles.set(key, { at: Date.now(), bytes });
  return bytes;
}
