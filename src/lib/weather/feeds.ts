import { alertKind, alertOnMap, alertRoute, parseHailInches, parseWindMph, untilLabel } from "./alerts.ts";
import { countyUgcs, geometryFromZone, mergeGeometries } from "./counties.ts";
import { asGeometry, bboxesOverlap, decimateGeometry, geometryBBox, pointNearBBox } from "./geometry.ts";
import type { BBox, OutlookArea, OutlookProduct, StormReport, WeatherAlert, WeatherGeometry } from "./types.ts";

const USER_AGENT = "TheRoofingCRM (https://myroofingtools.com; storm desk)";

const OUTLOOKS: Array<{ day: 1 | 2; product: OutlookProduct; file: string }> = [
  { day: 1, product: "hail", file: "day1otlk_hail.nolyr.geojson" },
  { day: 1, product: "sigHail", file: "day1otlk_cighail.nolyr.geojson" },
  { day: 1, product: "wind", file: "day1otlk_wind.nolyr.geojson" },
  { day: 1, product: "tornado", file: "day1otlk_torn.nolyr.geojson" },
  { day: 2, product: "hail", file: "day2otlk_hail.nolyr.geojson" },
  { day: 2, product: "sigHail", file: "day2otlk_cighail.nolyr.geojson" },
];

const COUNTY_OK_MS = 30 * 60 * 1000;
const COUNTY_MISS_MS = 2 * 60 * 1000;
const COUNTY_CAP = 80;
const COUNTY_BUDGET_MS = 12_000;

/** Public county outlines from api.weather.gov. Not office data. */
const countyCache = new Map<string, { until: number; geometry: WeatherGeometry | null }>();

export async function fetchActiveAlerts(states: string[], bbox: BBox | null): Promise<WeatherAlert[]> {
  const areas = [...new Set(states.map((state) => state.trim().toUpperCase()).filter((state) => /^[A-Z]{2}$/.test(state)))].slice(0, 8);
  if (!areas.length) return [];
  const batches = await Promise.all(areas.map((state) => fetchJson(`https://api.weather.gov/alerts/active?area=${state}`)));
  const pending: WeatherAlert[] = [];
  const seen = new Set<string>();
  for (const batch of batches) {
    const features = featuresOf(batch);
    for (const feature of features) {
      const alert = normalizeAlert(feature);
      if (!alert || seen.has(alert.id) || !alertOnMap(alert)) continue;
      seen.add(alert.id);
      pending.push(alert);
    }
  }
  const hydrated = await attachCountyGeometry(pending);
  const alerts: WeatherAlert[] = [];
  for (const alert of hydrated) {
    if (!alert.geometry) continue;
    if (bbox) {
      const box = geometryBBox(alert.geometry);
      if (box && !bboxesOverlap(box, bbox)) continue;
    }
    const kind = alert.kind ?? alertKind(alert.event);
    alerts.push({ ...alert, geometry: decimateGeometry(alert.geometry, kind === "watch" ? 200 : 280) });
  }
  return alerts;
}

/**
 * Tornado and severe watches usually have no polygon — only county codes.
 * Fill those counties so the map shades them the way a forecast map does.
 * A warning that already has a polygon keeps that polygon.
 */
export async function attachCountyGeometry(
  alerts: WeatherAlert[],
  load: (code: string) => Promise<WeatherGeometry | null> = cachedCounty,
): Promise<WeatherAlert[]> {
  const wanted = new Set<string>();
  for (const alert of alerts) {
    if (!wantsCounties(alert)) continue;
    for (const code of alert.ugc ?? []) wanted.add(code);
  }
  const codes = [...wanted].slice(0, COUNTY_CAP);
  const loaded = new Map<string, WeatherGeometry | null>();
  const started = Date.now();
  await pool(codes, 8, async (code) => {
    if (Date.now() - started > COUNTY_BUDGET_MS) return;
    try {
      loaded.set(code, await load(code));
    } catch {
      loaded.set(code, null);
    }
  });
  return alerts.map((alert) => {
    if (!wantsCounties(alert)) return alert;
    const parts: WeatherGeometry[] = [];
    for (const code of alert.ugc ?? []) {
      const geometry = loaded.get(code);
      if (geometry) parts.push(geometry);
    }
    const merged = mergeGeometries(parts);
    if (merged) return { ...alert, geometry: merged };
    return alert;
  });
}

function wantsCounties(alert: WeatherAlert) {
  if (!alert.ugc?.length) return false;
  const kind = alert.kind ?? alertKind(alert.event);
  if (kind === "watch") return true;
  return !alert.geometry;
}

async function cachedCounty(code: string): Promise<WeatherGeometry | null> {
  const hit = countyCache.get(code);
  if (hit && hit.until > Date.now()) return hit.geometry;
  try {
    const json = await fetchJson(`https://api.weather.gov/zones/county/${code}`, 8000);
    const geometry = geometryFromZone(json);
    countyCache.set(code, { until: Date.now() + (geometry ? COUNTY_OK_MS : COUNTY_MISS_MS), geometry });
    return geometry;
  } catch {
    countyCache.set(code, { until: Date.now() + COUNTY_MISS_MS, geometry: null });
    return null;
  }
}

async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  if (!items.length) return;
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item !== undefined) await worker(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
}

export async function fetchOutlooks(bbox: BBox | null): Promise<OutlookArea[]> {
  const files = await Promise.all(
    OUTLOOKS.map(async (item) => {
      try {
        const json = await fetchJson(`https://www.spc.noaa.gov/products/outlook/${item.file}`);
        return { item, json };
      } catch {
        return { item, json: null };
      }
    }),
  );
  const areas: OutlookArea[] = [];
  for (const { item, json } of files) {
    for (const feature of featuresOf(json)) {
      const geometry = asGeometry(feature.geometry);
      if (!geometry) continue;
      const box = geometryBBox(geometry);
      if (bbox && box && !bboxesOverlap(box, bbox)) continue;
      const props = record(feature.properties);
      const label = String(props.LABEL ?? props.label ?? "");
      areas.push({
        day: item.day,
        product: item.product,
        label: label || item.product,
        threshold: outlookThreshold(label, props.DN),
        fill: String(props.fill ?? "#f59e0b"),
        stroke: String(props.stroke ?? "#92400e"),
        geometry: decimateGeometry(geometry),
      });
    }
  }
  return areas;
}

export async function fetchStormReports(bbox: BBox | null): Promise<StormReport[]> {
  if (!bbox) return [];
  const end = new Date();
  const start = new Date(end.getTime() - 18 * 60 * 60 * 1000);
  const url = new URL("https://mesonet.agron.iastate.edu/geojson/lsr.py");
  url.searchParams.set("sts", start.toISOString().slice(0, 19) + "Z");
  url.searchParams.set("ets", end.toISOString().slice(0, 19) + "Z");
  url.searchParams.set("west", String(bbox.west));
  url.searchParams.set("south", String(bbox.south));
  url.searchParams.set("east", String(bbox.east));
  url.searchParams.set("north", String(bbox.north));
  let json: unknown;
  try {
    json = await fetchJson(url.toString());
  } catch {
    return [];
  }
  const reports: StormReport[] = [];
  for (const feature of featuresOf(json)) {
    const props = record(feature.properties);
    const kind = reportKind(String(props.typetext ?? props.type ?? ""));
    if (!kind) continue;
    const lat = numberOr(props.lat, NaN);
    const lng = numberOr(props.lon, NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !pointNearBBox(lng, lat, bbox)) continue;
    const magnitude = numberOr(props.magf ?? props.magnitude, NaN);
    const inches = kind === "hail" && Number.isFinite(magnitude) ? magnitude : null;
    const mph = kind === "wind" && Number.isFinite(magnitude) ? magnitude : null;
    const place = String(props.city ?? "").trim();
    const label =
      kind === "hail"
        ? `${Number.isFinite(magnitude) ? magnitude.toFixed(2) : "?"} in hail${place ? ` · ${place}` : ""}`
        : kind === "wind"
          ? `${Number.isFinite(magnitude) ? Math.round(magnitude) : "?"} mph${place ? ` · ${place}` : ""}`
          : `Tornado${place ? ` · ${place}` : ""}`;
    reports.push({
      id: String(props.product_id ?? feature.id ?? `${lat},${lng},${props.valid ?? reports.length}`),
      kind,
      lat,
      lng,
      inches,
      mph,
      label,
      city: place,
      valid: String(props.valid ?? ""),
    });
  }
  return reports.slice(0, 120);
}

export function normalizeAlert(feature: { id?: unknown; properties?: unknown; geometry?: unknown }): WeatherAlert | null {
  const props = record(feature.properties);
  const event = String(props.event ?? "").trim();
  if (!event) return null;
  const parameters = record(props.parameters);
  const hailInches = parseHailInches(parameters);
  const geometry = asGeometry(feature.geometry);
  const headline = String(props.headline ?? event);
  const ends = String(props.ends ?? props.expires ?? "");
  return {
    id: String(props.id ?? feature.id ?? headline),
    event,
    severity: String(props.severity ?? ""),
    headline,
    instruction: String(props.instruction ?? ""),
    onset: String(props.onset ?? ""),
    ends,
    until: untilLabel(headline, ends),
    hailInches,
    windMph: parseWindMph(parameters),
    route: alertRoute(event, hailInches),
    areaDesc: String(props.areaDesc ?? ""),
    geometry,
    ugc: countyUgcs(props),
    kind: alertKind(event),
  };
}

function outlookThreshold(label: string, dn: unknown) {
  if (/sign/i.test(label)) return 1;
  const numeric = Number.parseFloat(label);
  if (Number.isFinite(numeric)) return numeric > 1 ? numeric / 100 : numeric;
  const coded = typeof dn === "number" ? dn : Number.parseFloat(String(dn ?? ""));
  if (Number.isFinite(coded) && coded > 0) return coded > 1 ? coded / 100 : coded;
  return 0;
}

function reportKind(text: string): StormReport["kind"] | null {
  const value = text.toUpperCase();
  if (value.includes("HAIL")) return "hail";
  if (value.includes("TORN") || value.includes("FUNNEL")) return "tornado";
  if (value.includes("WIND") || value.includes("WND") || value === "G") return "wind";
  return null;
}

async function fetchJson(url: string, timeoutMs = 20000) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json, application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Weather feed answered ${response.status}.`);
  return response.json() as Promise<unknown>;
}

function featuresOf(json: unknown) {
  if (!json || typeof json !== "object") return [];
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  return features.filter((feature): feature is { id?: unknown; properties?: unknown; geometry?: unknown } =>
    Boolean(feature && typeof feature === "object"),
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function numberOr(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}
