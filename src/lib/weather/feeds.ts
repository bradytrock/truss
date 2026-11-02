import { alertRoute, parseHailInches, parseWindMph, untilLabel } from "./alerts.ts";
import { asGeometry, bboxesOverlap, decimateGeometry, geometryBBox, pointNearBBox } from "./geometry.ts";
import type { BBox, OutlookArea, OutlookProduct, StormReport, WeatherAlert } from "./types.ts";

const USER_AGENT = "TheRoofingCRM (https://myroofingtools.com; storm desk)";

const OUTLOOKS: Array<{ day: 1 | 2; product: OutlookProduct; file: string }> = [
  { day: 1, product: "hail", file: "day1otlk_hail.nolyr.geojson" },
  { day: 1, product: "sigHail", file: "day1otlk_cighail.nolyr.geojson" },
  { day: 1, product: "wind", file: "day1otlk_wind.nolyr.geojson" },
  { day: 1, product: "tornado", file: "day1otlk_torn.nolyr.geojson" },
  { day: 2, product: "hail", file: "day2otlk_hail.nolyr.geojson" },
  { day: 2, product: "sigHail", file: "day2otlk_cighail.nolyr.geojson" },
];

export async function fetchActiveAlerts(states: string[], bbox: BBox | null): Promise<WeatherAlert[]> {
  const areas = [...new Set(states.map((state) => state.trim().toUpperCase()).filter((state) => /^[A-Z]{2}$/.test(state)))].slice(0, 8);
  if (!areas.length) return [];
  const batches = await Promise.all(areas.map((state) => fetchJson(`https://api.weather.gov/alerts/active?area=${state}`)));
  const alerts: WeatherAlert[] = [];
  const seen = new Set<string>();
  for (const batch of batches) {
    const features = featuresOf(batch);
    for (const feature of features) {
      const alert = normalizeAlert(feature);
      if (!alert || seen.has(alert.id) || !alert.geometry) continue;
      if (alert.route === "map" && alert.event !== "Wind Advisory" && alert.event !== "Special Weather Statement") continue;
      if (bbox && alert.geometry) {
        const box = geometryBBox(alert.geometry);
        if (box && !bboxesOverlap(box, bbox)) continue;
      }
      if (alert.geometry) alert.geometry = decimateGeometry(alert.geometry);
      seen.add(alert.id);
      alerts.push(alert);
    }
  }
  return alerts;
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

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json, application/json" },
    signal: AbortSignal.timeout(20000),
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
