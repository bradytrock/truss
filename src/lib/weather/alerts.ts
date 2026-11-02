import type { AlertRoute, WeatherAlert } from "./types.ts";

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
