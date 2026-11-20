/** Shared storm-desk shapes. Safe to import from the browser and from route handlers. */

export type LngLat = [number, number];
export type Ring = LngLat[];

export type WeatherGeometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] };

export type BBox = { west: number; south: number; east: number; north: number };

export type AlertRoute = "sms" | "leaders" | "map";

/** Watch products are filled by county. Warnings keep the NWS polygon. */
export type AlertKind = "warning" | "watch" | "statement";

export type WeatherAlert = {
  id: string;
  event: string;
  severity: string;
  headline: string;
  instruction: string;
  onset: string;
  ends: string;
  until: string;
  hailInches: number | null;
  windMph: number | null;
  route: AlertRoute;
  areaDesc: string;
  geometry: WeatherGeometry | null;
  /** County UGC codes such as TXC439. Watches use these when the alert has no polygon. */
  ugc?: string[];
  kind?: AlertKind;
  /** Issuing office, e.g. "NWS Fort Worth TX". */
  sender?: string;
  /** "Radar indicated" or "Observed", from the NWS hail/tornado threat tags. */
  source?: string;
  /** Full product text under the headline. */
  description?: string;
};

/**
 * One row of the NEXRAD storm attribute table (the "T3", "Q7" cells a radar
 * desk shows). Motion follows the radar convention: the bearing the storm is
 * moving FROM, in degrees, and the speed in knots.
 */
export type StormCell = {
  id: string;
  radarSite: string;
  valid: string;
  lat: number;
  lng: number;
  maxDbz: number;
  echoTopKft: number;
  vil: number;
  /** Probability of severe hail, 0–100. */
  posh: number;
  /** Probability of any hail, 0–100. */
  poh: number;
  /** Radar-estimated max hail size in inches. 0 when none. */
  meshIn: number;
  motionFromDeg: number;
  motionKt: number;
  tvs: boolean;
  meso: boolean;
  /** dBZ change against the previous scan of the same cell. Null when this is the first scan seen. */
  dbzTrend: number | null;
};

export type OutlookProduct = "hail" | "wind" | "tornado" | "sigHail";

export type OutlookArea = {
  day: 1 | 2;
  product: OutlookProduct;
  label: string;
  /** Probability from 0 to 1. Significant-hail hatching uses 1. */
  threshold: number;
  fill: string;
  stroke: string;
  geometry: WeatherGeometry;
};

export type StormReport = {
  id: string;
  kind: "hail" | "wind" | "tornado";
  lat: number;
  lng: number;
  inches: number | null;
  mph: number | null;
  label: string;
  city: string;
  valid: string;
  /** Spotter remarks from the local storm report. */
  remarks?: string;
  /** Who reported it, e.g. "Trained Spotter". */
  source?: string;
  state?: string;
};

export type StormPoint = {
  id: string;
  lat: number;
  lng: number;
  state?: string;
};

export type MeshSample = { id: string; inches: number | null };
export type LightningSample = { id: string; percent: number | null };

export type MeshHailSwath = {
  id: string;
  stormDate: string;
  startedAt: string;
  endedAt: string;
  radarSite: string;
  stormMaxIn: number;
  source: string;
  track: LngLat[];
  bands: { sizeIn: number; geometry: WeatherGeometry }[];
  report: { sizeIn: number; place: string; reportedAt: string; lat: number; lng: number } | null;
};

export type StormLayers = {
  fetchedAt: string;
  bounds: BBox | null;
  alerts: WeatherAlert[];
  outlooks: OutlookArea[];
  reports: StormReport[];
  mesh: MeshSample[];
  lightning: LightningSample[];
  /** Radar-estimated hail polygons for the last 24 hours. Empty when MESH has none. */
  hailSwaths?: MeshHailSwath[];
  /** Latest scan of each NEXRAD storm cell near the jobs. Empty when the radar is quiet. */
  cells?: StormCell[];
  swathValid: string;
  errors: string[];
  attribution: string;
};
