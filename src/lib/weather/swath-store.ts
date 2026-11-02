import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { asGeometry } from "@/lib/weather/geometry";
import {
  hailAtPoint,
  toPopupHit,
  type HailPopupHit,
  type MapJobPoint,
} from "@/lib/weather/hail-point";
import type { HailStorm } from "@/lib/weather/sample-storms";
import type { LngLat } from "@/lib/weather/types";

type Client = SupabaseClient<Database>;

export type HailCatalog = {
  source: "database" | "sample";
  storms: HailStorm[];
};

export async function loadHailCatalog(supabase: Client): Promise<HailCatalog> {
  const storms = await supabase.from("hail_storms").select("id, storm_date, started_at, ended_at, radar_site, storm_max_in, source, track");
  if (storms.error || !storms.data?.length) return { source: "database", storms: [] };
  const [bands, reports] = await Promise.all([
    supabase.from("hail_swath_bands").select("storm_id, band_size_in, geom"),
    supabase.from("hail_storm_reports").select("storm_id, size_in, place, reported_at, lat, lng"),
  ]);
  if (bands.error || reports.error) return { source: "database", storms: [] };

  const built: HailStorm[] = [];
  for (const row of storms.data) {
    const track = lineTrack(row.track);
    if (!track) continue;
    const stormBands = (bands.data ?? [])
      .filter((band) => band.storm_id === row.id)
      .flatMap((band) => {
        const geometry = asGeometry(parseJson(band.geom));
        if (!geometry) return [];
        return [{ sizeIn: Number(band.band_size_in), geometry }];
      });
    if (!stormBands.length) continue;
    const report = (reports.data ?? []).find((item) => item.storm_id === row.id);
    built.push({
      id: row.id,
      stormDate: String(row.storm_date).slice(0, 10),
      startedAt: row.started_at,
      endedAt: row.ended_at,
      radarSite: row.radar_site,
      stormMaxIn: Number(row.storm_max_in),
      source: row.source || "mesh",
      track,
      bands: stormBands,
      report: report
        ? {
            sizeIn: Number(report.size_in),
            place: report.place,
            reportedAt: report.reported_at,
            lat: report.lat,
            lng: report.lng,
          }
        : null,
    });
  }
  if (!built.length) return { source: "database", storms: [] };
  return { source: "database", storms: built };
}

export async function lookupHailPoint(
  supabase: Client,
  lat: number,
  lng: number,
  sinceDays: number,
  companyId: string,
): Promise<{ source: "database" | "sample"; hits: HailPopupHit[] }> {
  const rpc = await supabase.rpc("hail_at_point", {
    p_lat: lat,
    p_lng: lng,
    p_since_days: sinceDays,
  });
  if (!rpc.error && Array.isArray(rpc.data)) {
    return {
      source: "database",
      hits: rpc.data.map((row) => ({
        stormId: row.storm_id,
        stormDate: String(row.storm_date).slice(0, 10),
        radarSite: row.radar_site,
        stormMaxIn: Number(row.storm_max_in),
        maxBandIn: Number(row.max_band_in),
        distanceMi: Number(row.distance_to_core_mi),
        passageAt: row.estimated_passage_at,
        passedStart: row.passed_over_start,
        passedEnd: row.passed_over_end,
        report: row.lsr_place
          ? {
              sizeIn: Number(row.lsr_size_in),
              place: row.lsr_place,
              reportedAt: row.lsr_reported_at ?? "",
            }
          : null,
        jobsInSwath: Number(row.jobs_in_swath) || 0,
        source: "database",
      })),
    };
  }

  const catalog = await loadHailCatalog(supabase);
  const jobs = await companyJobPoints(supabase, companyId);
  const hits = hailAtPoint(catalog.storms, lat, lng, { sinceDays, jobs }).map(toPopupHit);
  return { source: catalog.source, hits };
}

async function companyJobPoints(supabase: Client, companyId: string): Promise<MapJobPoint[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("lat, lng")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .not("lat", "is", null)
    .limit(2000);
  if (error || !data) return [];
  return data.flatMap((row) => {
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    return [{ lat, lng }];
  });
}

function lineTrack(value: unknown): LngLat[] | null {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== "object") return null;
  const line = parsed as { type?: string; coordinates?: unknown };
  if (line.type !== "LineString" || !Array.isArray(line.coordinates)) return null;
  const track: LngLat[] = [];
  for (const pair of line.coordinates) {
    if (!Array.isArray(pair) || pair.length < 2) return null;
    const lng = Number(pair[0]);
    const lat = Number(pair[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    track.push([lng, lat]);
  }
  return track.length ? track : null;
}

function parseJson(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
