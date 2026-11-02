import { alertSort } from "./alerts.ts";
import { pointInGeometry, milesBetween } from "./geometry.ts";
import { hailLabel } from "./hail.ts";
import type { LightningSample, MeshSample, OutlookArea, StormReport, WeatherAlert } from "./types.ts";

export type DeskJob = {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  postalCode: string;
  status: string;
  lat: number;
  lng: number;
  ownerStaffId: string;
};

export type JobStormImpact = {
  id: string;
  hailInches: number | null;
  hailText: string;
  warning: WeatherAlert | null;
  watch: WeatherAlert | null;
  outlookHail: number | null;
  sigHail: boolean;
  lightningPercent: number | null;
  nearestReport: { label: string; miles: number; valid: string } | null;
  hold: boolean;
  holdReason: string;
  photoPrompt: boolean;
  comps: Array<{ id: string; name: string; hailText: string }>;
};

export type CanvassRow = {
  id: string;
  name: string;
  city: string;
  postalCode: string;
  hailText: string;
  open: boolean;
  score: number;
  holdReason: string;
};

export type NeighborhoodScore = {
  key: string;
  label: string;
  jobs: number;
  openJobs: number;
  maxHail: number | null;
};

export type StormDesk = {
  impacts: JobStormImpact[];
  canvass: CanvassRow[];
  neighborhoods: NeighborhoodScore[];
  summary: string;
  digest: string;
  warningCount: number;
  hailCount: number;
};

const OPEN = new Set(["precon", "in_progress", "punch", "on_hold"]);

export function buildStormDesk(
  jobs: DeskJob[],
  input: {
    alerts: WeatherAlert[];
    outlooks: OutlookArea[];
    reports: StormReport[];
    mesh: MeshSample[];
    lightning: LightningSample[];
  },
): StormDesk {
  const mesh = new Map(input.mesh.map((row) => [row.id, row.inches]));
  const lightning = new Map(input.lightning.map((row) => [row.id, row.percent]));
  const alerts = [...input.alerts].sort(alertSort);
  const hailOutlooks = input.outlooks.filter((area) => area.product === "hail" && area.day === 1);
  const sigOutlooks = input.outlooks.filter((area) => area.product === "sigHail" && area.day === 1);

  const impacts = jobs.map((job) => impactFor(job, { alerts, hailOutlooks, sigOutlooks, reports: input.reports, mesh, lightning }));
  const byId = new Map(impacts.map((row) => [row.id, row]));
  for (const job of jobs) {
    const row = byId.get(job.id);
    if (!row || (row.hailInches ?? 0) < 0.75) continue;
    row.comps = compsFor(job, jobs, byId);
  }

  const canvass = impacts
    .map((row) => {
      const job = jobs.find((item) => item.id === row.id);
      if (!job) return null;
      const open = OPEN.has(job.status);
      const score = canvassScore({ inches: row.hailInches, open, warned: Boolean(row.warning) });
      if (score <= 0) return null;
      return {
        id: job.id,
        name: job.name,
        city: job.city,
        postalCode: job.postalCode,
        hailText: row.hailText || (row.warning ? row.warning.event : ""),
        open,
        score,
        holdReason: row.holdReason,
      } satisfies CanvassRow;
    })
    .filter((row): row is CanvassRow => Boolean(row))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const neighborhoods = scoreNeighborhoods(jobs, impacts);
  const warningCount = impacts.filter((row) => row.warning).length;
  const hailCount = impacts.filter((row) => (row.hailInches ?? 0) >= 1).length;
  const digest = digestLine(impacts, jobs);
  return {
    impacts,
    canvass,
    neighborhoods,
    summary: summaryLine({ warningCount, hailCount, impacts }),
    digest,
    warningCount,
    hailCount,
  };
}

export function canvassScore(input: { inches: number | null; open: boolean; warned: boolean }) {
  const inches = input.inches ?? 0;
  if (inches < 1 && !input.warned) return 0;
  const base = Math.max(inches, input.warned ? 1 : 0) * 10;
  const past = input.open ? 0 : 30;
  const openFactor = input.open ? 0.35 : 1;
  return Math.round((base + past) * openFactor);
}

function impactFor(
  job: DeskJob,
  input: {
    alerts: WeatherAlert[];
    hailOutlooks: OutlookArea[];
    sigOutlooks: OutlookArea[];
    reports: StormReport[];
    mesh: Map<string, number | null>;
    lightning: Map<string, number | null>;
  },
): JobStormImpact {
  const inches = input.mesh.get(job.id);
  const hailInches = inches == null ? null : inches;
  const covering = input.alerts.filter((alert) => alert.geometry && pointInGeometry(job.lng, job.lat, alert.geometry));
  const warning = covering.find((alert) => alert.route === "sms") ?? null;
  const watch = covering.find((alert) => alert.route === "leaders") ?? null;
  const outlookHail = maxThreshold(input.hailOutlooks, job);
  const sigHail = input.sigOutlooks.some((area) => pointInGeometry(job.lng, job.lat, area.geometry));
  const lightningPercent = input.lightning.get(job.id) ?? null;
  const nearest = nearestReport(job, input.reports);
  const holdReason = holdReasonFor({ warning, hailInches, sigHail, outlookHail });
  return {
    id: job.id,
    hailInches,
    hailText: hailLabel(hailInches),
    warning,
    watch,
    outlookHail,
    sigHail,
    lightningPercent,
    nearestReport: nearest,
    hold: Boolean(holdReason),
    holdReason,
    photoPrompt: (hailInches ?? 0) >= 1 || Boolean(warning && (warning.hailInches ?? 0) >= 0.75),
    comps: [],
  };
}

function maxThreshold(areas: OutlookArea[], job: DeskJob) {
  let best: number | null = null;
  for (const area of areas) {
    if (!pointInGeometry(job.lng, job.lat, area.geometry)) continue;
    if (best == null || area.threshold > best) best = area.threshold;
  }
  return best;
}

function nearestReport(job: DeskJob, reports: StormReport[]) {
  let best: { label: string; miles: number; valid: string } | null = null;
  for (const report of reports) {
    if (report.kind !== "hail" && report.kind !== "wind") continue;
    const miles = milesBetween(job, report);
    if (miles > 25) continue;
    if (!best || miles < best.miles) best = { label: report.label, miles, valid: report.valid };
  }
  return best;
}

export function holdReasonFor(input: {
  warning: WeatherAlert | null;
  hailInches: number | null;
  sigHail: boolean;
  outlookHail: number | null;
}) {
  if (input.warning) {
    const hail = input.warning.hailInches ? ` · hail ${input.warning.hailInches.toFixed(2)} in` : "";
    return `Hold install — ${input.warning.event}${hail}`;
  }
  if ((input.hailInches ?? 0) >= 1) return `Hold install — radar-estimated ${input.hailInches?.toFixed(2)} in`;
  if (input.sigHail) return "Hold install — significant hail is hatched over this site";
  if ((input.outlookHail ?? 0) >= 0.15) return `Hold install — Day 1 hail ${Math.round((input.outlookHail ?? 0) * 100)}%`;
  return "";
}

function compsFor(job: DeskJob, jobs: DeskJob[], impacts: Map<string, JobStormImpact>) {
  const mine = impacts.get(job.id)?.hailInches ?? 0;
  return jobs
    .filter((other) => other.id !== job.id)
    .map((other) => {
      const inches = impacts.get(other.id)?.hailInches ?? 0;
      return { other, inches, miles: milesBetween(job, other) };
    })
    .filter((row) => row.inches >= 0.75 && row.miles <= 20 && Math.abs(row.inches - mine) <= 0.75)
    .sort((a, b) => a.miles - b.miles)
    .slice(0, 4)
    .map((row) => ({
      id: row.other.id,
      name: row.other.code || row.other.name,
      hailText: hailLabel(row.inches),
    }));
}

function scoreNeighborhoods(jobs: DeskJob[], impacts: JobStormImpact[]): NeighborhoodScore[] {
  const buckets = new Map<string, NeighborhoodScore>();
  for (const job of jobs) {
    const impact = impacts.find((row) => row.id === job.id);
    if (!impact || ((impact.hailInches ?? 0) < 0.75 && !impact.warning)) continue;
    const city = job.city.trim();
    const key = (job.postalCode || city || "Nearby").trim();
    const label = city ? `${city}${job.state ? `, ${job.state}` : ""}` : key;
    const bucket = buckets.get(key) ?? { key, label, jobs: 0, openJobs: 0, maxHail: null };
    bucket.jobs += 1;
    if (OPEN.has(job.status)) bucket.openJobs += 1;
    if (impact.hailInches != null && (bucket.maxHail == null || impact.hailInches > bucket.maxHail)) {
      bucket.maxHail = impact.hailInches;
    }
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => (b.maxHail ?? 0) - (a.maxHail ?? 0) || b.jobs - a.jobs);
}

function summaryLine(input: { warningCount: number; hailCount: number; impacts: JobStormImpact[] }) {
  if (input.warningCount > 0) {
    const tornado = input.impacts.some((row) => row.warning?.event === "Tornado Warning");
    const noun = tornado ? "Tornado warning" : "Warning";
    return `${noun} on ${input.warningCount} job${input.warningCount === 1 ? "" : "s"}.`;
  }
  if (input.hailCount > 0) return `Radar-estimated hail of 1 in or larger on ${input.hailCount} job${input.hailCount === 1 ? "" : "s"}.`;
  const outlookJobs = input.impacts.filter((row) => (row.outlookHail ?? 0) >= 0.15).length;
  if (outlookJobs > 0) return `Day 1 hail risk of 15% or more covers ${outlookJobs} job${outlookJobs === 1 ? "" : "s"}.`;
  return "No significant hail or warnings on the book right now.";
}

function digestLine(impacts: JobStormImpact[], jobs: DeskJob[]) {
  const hit = impacts.filter((row) => (row.outlookHail ?? 0) >= 0.15 || row.sigHail);
  if (!hit.length) return "";
  const percent = Math.max(...hit.map((row) => row.outlookHail ?? 0));
  const cities = uniqueCities(hit.map((row) => jobs.find((job) => job.id === row.id)?.city ?? ""));
  const sig = impacts.filter((row) => row.sigHail).length;
  const percentText = percent > 0 ? `${Math.round(percent * 100)}%` : "a risk";
  const where = cities.length ? `, mostly ${cities.slice(0, 3).join(", ")}` : "";
  const hatch = sig > 0 ? ` Significant hail is hatched on ${sig}.` : "";
  return `Day 1 hail ${percentText} over ${hit.length} job${hit.length === 1 ? "" : "s"}${where}.${hatch}`;
}

function uniqueCities(cities: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const city of cities) {
    const clean = city.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    next.push(clean);
  }
  return next;
}

export const PHOTO_PROMPT = "Shoot the slopes, soft metal, and the gutters before you leave.";
