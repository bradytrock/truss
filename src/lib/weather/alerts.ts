import type { AlertKind, AlertRoute, WeatherAlert, WeatherGeometry } from "./types.ts";

const SMS_EVENTS = new Set(["Tornado Warning", "Severe Thunderstorm Warning", "Flash Flood Warning"]);
const LEADER_EVENTS = new Set([
  "Tornado Watch",
  "Severe Thunderstorm Watch",
  "Flash Flood Watch",
  "High Wind Warning",
]);

export function alertRoute(event: string, hailInches: number | null): AlertRoute {
  if (SMS_EVENTS.has(event)) return "sms";
  if (event === "Special Weather Statement" && (hailInches ?? 0) >= 0.75) return "sms";
  if (LEADER_EVENTS.has(event)) return "leaders";
  return "map";
}

export function alertKind(event: string): AlertKind {
  if (/\bwatch\b/i.test(event)) return "watch";
  if (/\bwarning\b/i.test(event)) return "warning";
  return "statement";
}

export type AlertPaint = {
  fill: string;
  stroke: string;
  fillOpacity: number;
  weight: number;
  dash?: string;
  /** County fill, the way a watch is drawn on a forecast map. */
  county: boolean;
};

/** Colors follow the NWS map: pink counties for a tornado watch, yellow for a severe watch, polygons for warnings. */
export function alertPaint(alert: { event: string; kind?: AlertKind }): AlertPaint {
  const kind = alert.kind ?? alertKind(alert.event);
  if (kind === "watch") {
    if (/tornado/i.test(alert.event)) {
      return { fill: "#f9a8d4", stroke: "#9f1239", fillOpacity: 0.42, weight: 1, county: true };
    }
    if (/flood/i.test(alert.event)) {
      return { fill: "#86efac", stroke: "#166534", fillOpacity: 0.36, weight: 1, county: true };
    }
    return { fill: "#facc15", stroke: "#a16207", fillOpacity: 0.4, weight: 1, county: true };
  }
  if (/tornado/i.test(alert.event)) {
    return { fill: "#ef4444", stroke: "#7f1d1d", fillOpacity: 0.34, weight: 2.5, county: false };
  }
  if (/flood/i.test(alert.event)) {
    return { fill: "#22c55e", stroke: "#14532d", fillOpacity: 0.28, weight: 2, county: false };
  }
  if (/severe thunderstorm/i.test(alert.event)) {
    return { fill: "#fb923c", stroke: "#9a3412", fillOpacity: 0.32, weight: 2.25, county: false };
  }
  if (kind === "warning") {
    return { fill: "#f97316", stroke: "#9a3412", fillOpacity: 0.24, weight: 2, county: false };
  }
  return { fill: "#fdba74", stroke: "#c2410c", fillOpacity: 0.12, weight: 1.5, dash: "6 4", county: false };
}

export function alertDrawRank(alert: { event: string; kind?: AlertKind }) {
  const kind = alert.kind ?? alertKind(alert.event);
  if (kind === "watch") return 0;
  if (kind === "warning") return 2;
  return 1;
}

/** Keep warnings and watches that can be drawn, including watches that only list counties. */
export function alertOnMap(alert: {
  event: string;
  route: AlertRoute;
  geometry: WeatherGeometry | null;
  ugc?: string[];
}) {
  const counties = alert.ugc?.length ?? 0;
  const hasShape = Boolean(alert.geometry) || counties > 0;
  if (!hasShape) return false;
  if (alert.route === "sms" || alert.route === "leaders") return true;
  if (alert.event === "Wind Advisory" || alert.event === "Special Weather Statement") return Boolean(alert.geometry);
  const kind = alertKind(alert.event);
  return kind === "warning" || kind === "watch";
}

export function shortAlertLabel(event: string) {
  if (event === "Severe Thunderstorm Warning") return "SVR warning";
  if (event === "Severe Thunderstorm Watch") return "SVR watch";
  if (event === "Tornado Warning") return "Tornado warning";
  if (event === "Tornado Watch") return "Tornado watch";
  if (event === "Flash Flood Warning") return "Flood warning";
  if (event === "Flash Flood Watch") return "Flood watch";
  return event;
}

export type AlertChip = { label: string; tone: "warning" | "watch" };

export function alertChips(alerts: Array<{ event: string; kind?: AlertKind }>): AlertChip[] {
  const chips: AlertChip[] = [];
  const seen = new Set<string>();
  for (const alert of alerts) {
    const kind = alert.kind ?? alertKind(alert.event);
    if (kind === "statement") continue;
    const label = shortAlertLabel(alert.event);
    if (seen.has(label)) continue;
    seen.add(label);
    chips.push({ label, tone: kind });
  }
  return chips;
}

export function parseHailInches(parameters: Record<string, unknown> | null | undefined) {
  const raw = firstParam(parameters, "maxHailSize");
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function parseWindMph(parameters: Record<string, unknown> | null | undefined) {
  const raw = firstParam(parameters, "maxWindGust");
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  const value = match ? Number.parseFloat(match[1]) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function firstParam(parameters: Record<string, unknown> | null | undefined, key: string) {
  const value = parameters?.[key];
  if (Array.isArray(value)) return String(value[0] ?? "");
  if (typeof value === "string") return value;
  return "";
}

/** Prefer the weather office's own "until …" so the clock is in their local time. */
export function untilLabel(headline: string, ends: string, timeZone = "America/Chicago") {
  const match = headline.match(/until\s+([^.;]+)/i);
  if (match?.[1]?.trim()) return match[1].trim();
  const date = new Date(ends);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(date);
}

export function crewWarningText(input: {
  event: string;
  until: string;
  hailInches: number | null;
  windMph: number | null;
  places: string[];
}) {
  const details = [
    input.hailInches ? `Hail ${input.hailInches.toFixed(2)} in` : "",
    input.windMph ? `wind ${Math.round(input.windMph)} mph` : "",
  ].filter(Boolean);
  const names = input.places.filter(Boolean).slice(0, 3);
  const extra = input.places.length - names.length;
  const where = names.length
    ? ` Jobs: ${names.join(", ")}${extra > 0 ? ` and ${extra} more` : ""}.`
    : "";
  const until = input.until ? ` until ${input.until}` : "";
  const middle = details.length ? ` ${details.join(", ")}.` : "";
  return `${input.event}${until}.${middle}${where} Get off the roof.`.replace(/\s+/g, " ").trim();
}

export function outlookText(input: { jobs: number; hailPercent: number | null; sigHailJobs: number; cities: string[] }) {
  const percent = input.hailPercent == null ? "" : `${Math.round(input.hailPercent * 100)}%`;
  const cities = input.cities.filter(Boolean).slice(0, 3);
  const where = cities.length ? `, mostly ${cities.join(", ")}` : "";
  const sig = input.sigHailJobs > 0 ? ` Significant hail is hatched on ${input.sigHailJobs}.` : "";
  return `Day 1 hail ${percent || "risk"} over ${input.jobs} job${input.jobs === 1 ? "" : "s"}${where}.${sig} Move south-facing installs if the crew would still be up there this afternoon.`.replace(/\s+/g, " ").trim();
}

export function lightningText(percent: number, places: string[]) {
  const names = places.filter(Boolean).slice(0, 3);
  const where = names.length ? ` Near ${names.join(", ")}.` : "";
  return `Lightning probability ${Math.round(percent)}% in the next 30 minutes.${where} Get off the roof before a warning is out.`;
}

export function alertSort(a: WeatherAlert, b: WeatherAlert) {
  return routeRank(b.route) - routeRank(a.route) || a.event.localeCompare(b.event);
}

function routeRank(route: AlertRoute) {
  if (route === "sms") return 3;
  if (route === "leaders") return 2;
  return 1;
}
