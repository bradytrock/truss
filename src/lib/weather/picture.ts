import { fetchActiveAlerts, fetchOutlooks, fetchStormCells, fetchStormReports } from "./feeds.ts";
import { loadCrop, sampleCrop } from "./grib.ts";
import { bboxOfPoints, expandBBox, pointInGeometry } from "./geometry.ts";
import { meshInchesFromMillimeters } from "./hail.ts";
import { nearestRadarSite, outerBand } from "./hail-point.ts";
import { meshSwathFromGrid } from "./mesh-swath.ts";
import type { HailStorm } from "./sample-storms.ts";
import type { BBox, StormLayers, StormPoint, StormReport } from "./types.ts";

const MESH_DIR = "https://mrms.ncep.noaa.gov/2D/MESH_Max_1440min/";
const MESH_FILE = /href="(MRMS_MESH_Max_1440min_[^"]+\.grib2\.gz)"/g;
const LIGHTNING_DIR = "https://mrms.ncep.noaa.gov/2D/LightningProbabilityNext30min/";
const LIGHTNING_FILE = /href="(MRMS_LightningProbabilityNext30min[^"]+\.grib2\.gz)"/g;
const ROTATION_DIR = "https://mrms.ncep.noaa.gov/2D/RotationTrack1440min/";
const ROTATION_FILE = /href="(MRMS_RotationTrack1440min_[^"]+\.grib2\.gz)"/g;

export const STORM_ATTRIBUTION = "Alerts: NWS. Outlooks: SPC. Hail swath: NOAA MRMS MESH. Reports and storm cells: IEM / NWS NEXRAD.";

/** Radar sites that cover the jobs: the nearest one to each corner and the middle of the box. */
export function radarSitesFor(points: Array<{ lat: number; lng: number }>, bounds: BBox | null) {
  const sites = new Set<string>();
  for (const point of points.slice(0, 50)) sites.add(nearestRadarSite(point.lat, point.lng));
  if (bounds) {
    sites.add(nearestRadarSite(bounds.north, bounds.west));
    sites.add(nearestRadarSite(bounds.north, bounds.east));
    sites.add(nearestRadarSite(bounds.south, bounds.west));
    sites.add(nearestRadarSite(bounds.south, bounds.east));
  }
  return [...sites];
}

export function stormBounds(points: Array<{ lat: number; lng: number }>): BBox | null {
  const box = bboxOfPoints(points);
  if (!box) return null;
  const span = Math.max(box.east - box.west, box.north - box.south);
  const pad = span < 0.4 ? 0.45 : 0.3;
  return expandBBox(box, pad);
}

export async function buildStormLayers(points: StormPoint[], states: string[]): Promise<StormLayers> {
  const clean = points
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng) && point.id)
    .slice(0, 400);
  if (!clean.length) {
    return {
      fetchedAt: new Date().toISOString(),
      bounds: null,
      alerts: [],
      outlooks: [],
      reports: [],
      mesh: [],
      lightning: [],
      hailSwaths: [],
      cells: [],
      swathValid: "",
      errors: ["Map a job site so the outlook knows where to look."],
      attribution: STORM_ATTRIBUTION,
    };
  }
  const bounds = stormBounds(clean);
  const stateList = [
    ...new Set(
      [...states, ...clean.map((point) => point.state ?? "")]
        .map((state) => state.trim().toUpperCase())
        .filter((state) => /^[A-Z]{2}$/.test(state)),
    ),
  ];
  const errors: string[] = [];
  const [alerts, outlooks, reports, mesh, lightning, cells] = await Promise.all([
    fetchActiveAlerts(stateList, bounds).catch((error: unknown) => {
      errors.push(message(error, "Active warnings did not load."));
      return [];
    }),
    fetchOutlooks(bounds).catch((error: unknown) => {
      errors.push(message(error, "The SPC outlook did not load."));
      return [];
    }),
    fetchStormReports(bounds).catch(() => []),
    bounds ? sampleMesh(bounds, clean).catch((error: unknown) => {
      errors.push(message(error, "The hail swath did not load."));
      return { samples: clean.map((point) => ({ id: point.id, inches: null })), valid: "", swath: null as HailStorm | null };
    }) : Promise.resolve({ samples: [], valid: "", swath: null as HailStorm | null }),
    bounds ? sampleLightning(bounds, clean).catch(() => clean.map((point) => ({ id: point.id, percent: null }))) : Promise.resolve([]),
    fetchStormCells(radarSitesFor(clean, bounds), bounds).catch(() => []),
  ]);

  return {
    fetchedAt: new Date().toISOString(),
    bounds,
    alerts,
    outlooks,
    reports,
    mesh: mesh.samples,
    lightning,
    hailSwaths: mesh.swath ? [attachHailReport(mesh.swath, reports)] : [],
    cells,
    swathValid: mesh.valid,
    errors,
    attribution: STORM_ATTRIBUTION,
  };
}

async function sampleMesh(bounds: BBox, points: StormPoint[]) {
  const grid = await loadCrop(MESH_DIR, MESH_FILE, bounds, (mm) => {
    const inches = meshInchesFromMillimeters(mm);
    return inches > 0 ? inches : null;
  });
  return {
    valid: grid.valid,
    samples: points.map((point) => ({ id: point.id, inches: sampleCrop(grid, point.lat, point.lng) })),
    swath: meshSwathFromGrid(grid),
  };
}

function attachHailReport(storm: HailStorm, reports: StormReport[]): HailStorm {
  const outer = outerBand(storm);
  let best: StormReport | null = null;
  for (const report of reports) {
    if (report.kind !== "hail" || report.inches == null || report.inches < 0.75) continue;
    if (!pointInGeometry(report.lng, report.lat, outer.geometry)) continue;
    if (!best || report.inches > (best.inches ?? 0)) best = report;
  }
  if (!best || best.inches == null) return storm;
  const reportedAt = Date.parse(best.valid) ? new Date(best.valid).toISOString() : storm.endedAt;
  return {
    ...storm,
    report: {
      sizeIn: best.inches,
      place: best.city || best.label,
      reportedAt,
      lat: best.lat,
      lng: best.lng,
    },
  };
}

async function sampleLightning(bounds: BBox, points: StormPoint[]) {
  const grid = await loadCrop(LIGHTNING_DIR, LIGHTNING_FILE, bounds, (value) => {
    if (!Number.isFinite(value) || value < 0 || value > 100) return null;
    return value;
  });
  let max = 0;
  for (const value of grid.values) if (Number.isFinite(value) && value > max) max = value;
  const scale = max > 0 && max <= 1.5 ? 100 : 1;
  return points.map((point) => {
    const value = sampleCrop(grid, point.lat, point.lng);
    if (value == null) return { id: point.id, percent: null };
    const percent = value * scale;
    return { id: point.id, percent: percent >= 0 && percent <= 100 ? percent : null };
  });
}

export async function loadMeshCrop(bounds: BBox) {
  return loadCrop(MESH_DIR, MESH_FILE, bounds, (mm) => {
    const inches = meshInchesFromMillimeters(mm);
    return inches > 0 ? inches : null;
  });
}

export async function loadRotationCrop(bounds: BBox) {
  return loadCrop(ROTATION_DIR, ROTATION_FILE, bounds, (value) => (value > 0 ? value : null));
}

function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
