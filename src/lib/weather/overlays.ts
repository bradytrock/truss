import { alertKind } from "./alerts.ts";
import { etaIso, minutesSince, type PointThreat } from "./cells.ts";
import { milesBetween } from "./geometry.ts";
import { hailBin } from "./hail.ts";
import { formatChicagoShortClock, formatChipDate, formatHailInches, type HailPopupHit } from "./hail-point.ts";
import type { StormReport, WeatherAlert } from "./types.ts";

export type BandTone = "red" | "amber" | "purple" | "green" | "cyan" | "slate";

export type JobBand = {
  kind: "tornado" | "warning" | "overhead" | "incoming" | "swath" | "clear";
  tone: BandTone;
  label: string;
  /** The warning behind a red or amber band. */
  warning: WeatherAlert | null;
};

/** Warnings only — watches shade the county and do not change a job card. */
export function warningsAt(alerts: WeatherAlert[], inside: (alert: WeatherAlert) => boolean) {
  return alerts
    .filter((alert) => (alert.kind ?? alertKind(alert.event)) === "warning" && alert.geometry && inside(alert))
    .sort((a, b) => warningRank(b) - warningRank(a));
}

function warningRank(alert: WeatherAlert) {
  if (/tornado/i.test(alert.event)) return 3;
  if (/severe thunderstorm/i.test(alert.event)) return 2;
  if (/flood/i.test(alert.event)) return 1;
  return 0;
}

export function warningTone(event: string): BandTone {
  if (/tornado/i.test(event)) return "red";
  if (/flood/i.test(event)) return "cyan";
  return "amber";
}

export function shortWarningName(event: string) {
  if (event === "Severe Thunderstorm Warning") return "Severe T-storm warning";
  if (event === "Flash Flood Warning") return "Flash flood warning";
  return event.replace(/\bWarning\b/, "warning");
}

/** The strip at the top of a job card: the worst thing happening to that address right now. */
export function jobBand(input: { warnings: WeatherAlert[]; threat: PointThreat; swathHit: HailPopupHit | null; now?: Date }): JobBand {
  const now = input.now ?? new Date();
  const warning = input.warnings[0] ?? null;
  if (warning) {
    const until = warning.until ? ` · until ${warning.until}` : "";
    return {
      kind: /tornado/i.test(warning.event) ? "tornado" : "warning",
      tone: warningTone(warning.event),
      label: `${shortWarningName(warning.event)}${until}`,
      warning,
    };
  }
  if (input.threat.overhead) {
    const cell = input.threat.overhead.cell;
    const hail = cell.meshIn >= 0.5 ? ` · ${formatHailInches(cell.meshIn)} hail` : "";
    return { kind: "overhead", tone: "amber", label: `Cell ${cell.id} overhead${hail}`, warning: null };
  }
  if (input.threat.incoming) {
    const { cell, etaMinutes } = input.threat.incoming;
    const left = Math.max(1, etaMinutes - minutesSince(cell.valid, now));
    return { kind: "incoming", tone: "slate", label: `Cell ${cell.id} inbound · ~${left} min`, warning: null };
  }
  if (input.swathHit) {
    return { kind: "swath", tone: "purple", label: `Inside ${formatChipDate(input.swathHit.stormDate)} hail swath`, warning: null };
  }
  const nearest = input.threat.nearestMi;
  if (nearest != null && nearest < 25) {
    return { kind: "clear", tone: "green", label: `Clear · nearest storm ${Math.round(nearest)} mi`, warning: null };
  }
  return { kind: "clear", tone: "green", label: "Clear · no storms within 25 mi", warning: null };
}

/** "~2:29 PM · 39 min" for a cell arriving `etaMinutes` after its scan. */
export function arrivalLabel(validIso: string, etaMinutes: number, now = new Date()) {
  const left = Math.max(1, etaMinutes - minutesSince(validIso, now));
  return `~${formatChicagoShortClock(etaIso(validIso, etaMinutes))} · ${left} min`;
}

export function clearsByLabel(validIso: string, clearsInMinutes: number | null, fallbackIso: string) {
  if (clearsInMinutes != null) return `~${formatChicagoShortClock(etaIso(validIso, clearsInMinutes))}`;
  const fallback = formatChicagoShortClock(fallbackIso);
  return fallback ? `~${fallback}` : "—";
}

export function hailEventsAtLeast(hits: HailPopupHit[], inches: number) {
  return hits.filter((hit) => hit.maxBandIn + 1e-6 >= inches).length;
}

export function nearestReportTo(reports: StormReport[], lat: number, lng: number, kind: StormReport["kind"] = "hail") {
  let best: { report: StormReport; miles: number } | null = null;
  for (const report of reports) {
    if (report.kind !== kind) continue;
    const miles = milesBetween({ lat, lng }, report);
    if (!best || miles < best.miles) best = { report, miles };
  }
  return best;
}

export function jobsWithin<T extends { lat: number; lng: number }>(jobs: T[], lat: number, lng: number, miles: number) {
  return jobs
    .map((job) => ({ job, miles: milesBetween({ lat, lng }, job) }))
    .filter((row) => row.miles <= miles)
    .sort((a, b) => a.miles - b.miles);
}

/** Note saved on the job when the rep attaches the radar hail to the claim. */
export function hailClaimNote(hit: HailPopupHit, address: string) {
  const bin = hailBin(hit.maxBandIn);
  const where = address ? ` at ${address}` : "";
  const size = `${formatHailInches(hit.maxBandIn)}${bin ? ` (${bin.label.toLowerCase()})` : ""}`;
  const storm = `storm max ${formatHailInches(hit.stormMaxIn)}, ${hit.distanceMi.toFixed(1)} mi from the core`;
  const source = hit.source === "mesh" ? "NOAA MRMS MESH, 24-hour max" : `${hit.radarSite} radar estimate`;
  const report = hit.report ? ` Spotter: ${formatHailInches(hit.report.sizeIn)} hail ${hit.report.place}.` : "";
  return `Radar-estimated hail ${size}${where} on ${formatChipDate(hit.stormDate)} · ${storm} · ${source}.${report}`;
}

/** Plain text a rep pastes into the claim file. */
export function reportClaimText(report: StormReport, timeZone = "America/Chicago") {
  const when = new Date(report.valid);
  const date = Number.isNaN(when.getTime())
    ? report.valid
    : new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(when);
  const size = report.kind === "hail" && report.inches != null ? `${formatHailInches(report.inches)} hail` : report.kind === "wind" && report.mph != null ? `${Math.round(report.mph)} mph wind` : report.label;
  const lines = [
    `NWS local storm report · ${size}`,
    `When: ${date}`,
    `Where: ${report.city || `${report.lat.toFixed(4)}, ${report.lng.toFixed(4)}`}${report.state ? `, ${report.state}` : ""}`,
    report.source ? `Source: ${report.source}` : "",
    report.remarks ? `Remarks: ${report.remarks}` : "",
    `Location: ${report.lat.toFixed(4)}, ${report.lng.toFixed(4)}`,
  ];
  return lines.filter(Boolean).join("\n");
}

/** Hail reports from the LSR feed, biggest first. */
export function hailReports(reports: StormReport[]) {
  return reports.filter((report) => report.kind === "hail" && (report.inches ?? 0) > 0).sort((a, b) => (b.inches ?? 0) - (a.inches ?? 0));
}
