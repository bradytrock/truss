/**
 * NWS NEXRAD composite tiles from the Iowa Environmental Mesonet.
 * RainViewer's public maps API is personal-use only, so the desk map uses this source.
 */
export const RADAR_TILE_HOST = "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0";
export const RADAR_OPACITY = 0.8;
export const RADAR_MAX_NATIVE_ZOOM = 8;
export const RADAR_ATTRIBUTION =
  'Radar &copy; <a href="https://mesonet.agron.iastate.edu/">IEM</a> / NWS';
export const RADAR_EMPTY_TILE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const FRAME_MINUTES = [50, 40, 30, 20, 10, 0] as const;

export type RadarFrame = {
  minutesAgo: number;
  label: string;
  url: string;
  holdMs: number;
};

export const RADAR_LEGEND = [
  { label: "Light", color: "#00e600" },
  { label: "Moderate", color: "#ffff00" },
  { label: "Heavy", color: "#ff0000" },
  { label: "Extreme", color: "#ff00ff" },
] as const;

export function radarProduct(minutesAgo: number) {
  if (!Number.isInteger(minutesAgo) || minutesAgo < 0 || minutesAgo > 55 || minutesAgo % 5 !== 0) {
    throw new Error(`Unsupported radar frame: ${minutesAgo}`);
  }
  if (minutesAgo === 0) return "nexrad-n0q-900913";
  return `nexrad-n0q-900913-m${String(minutesAgo).padStart(2, "0")}m`;
}

export function radarTileUrl(minutesAgo: number) {
  return `${RADAR_TILE_HOST}/${radarProduct(minutesAgo)}/{z}/{x}/{y}.png`;
}

export function radarFrameLabel(minutesAgo: number) {
  if (minutesAgo <= 0) return "Now";
  return `${minutesAgo} min ago`;
}

export function radarFrames(): RadarFrame[] {
  return FRAME_MINUTES.map((minutesAgo) => ({
    minutesAgo,
    label: radarFrameLabel(minutesAgo),
    url: radarTileUrl(minutesAgo),
    holdMs: minutesAgo === 0 ? 1800 : 800,
  }));
}
