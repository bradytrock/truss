import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import { publicObjectUrl } from "@/lib/storage/urls";
import {
  parseRoofDrawing,
  type RoofDrawing,
} from "@/lib/roof-measure";

export const ROOF_REPORTS_SQL = "supabase/migrations/20261014120000_roof_reports.sql";

export type RoofReportStatus = "draft" | "ready";

export type StoredRoofReport = {
  id: string | null;
  status: RoofReportStatus;
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  drawing: RoofDrawing;
  updatedAt: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageKey(jobId: string) {
  return `theroofingcrm.roof-report.v1:${jobId}`;
}

export function roofImageSrc(imagePath: string) {
  if (!imagePath) return "";
  if (imagePath.startsWith("blob:") || imagePath.startsWith("data:")) return imagePath;
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) return imagePath;
  if (imagePath.startsWith("/")) return imagePath;
  return publicObjectUrl(imagePath);
}

export function readLocalRoofReport(jobId: string): StoredRoofReport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(jobId));
    if (!raw) return null;
    return parseStored(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeLocalRoofReport(jobId: string, report: StoredRoofReport) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(jobId), JSON.stringify(report));
}

function parseStored(value: unknown): StoredRoofReport | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const status = row.status === "ready" ? "ready" : "draft";
  const updatedAt = typeof row.updatedAt === "string" ? row.updatedAt : "";
  if (!updatedAt) return null;
  return {
    id: typeof row.id === "string" ? row.id : null,
    status,
    imagePath: typeof row.imagePath === "string" ? row.imagePath : "",
    imageWidth: typeof row.imageWidth === "number" ? row.imageWidth : 0,
    imageHeight: typeof row.imageHeight === "number" ? row.imageHeight : 0,
    drawing: parseRoofDrawing(row.drawing),
    updatedAt,
  };
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function fromRow(row: Record<string, unknown>): StoredRoofReport {
  const scale = asNumber(row.feet_per_pixel);
  const waste = asNumber(row.waste_percent);
  return {
    id: typeof row.id === "string" ? row.id : null,
    status: row.status === "ready" ? "ready" : "draft",
    imagePath: typeof row.image_path === "string" ? row.image_path : "",
    imageWidth: asNumber(row.image_width) ?? 0,
    imageHeight: asNumber(row.image_height) ?? 0,
    drawing: parseRoofDrawing({
      points: row.points,
      edges: row.edges,
      facets: row.facets,
      feetPerPixel: scale,
      wastePercent: waste ?? 15,
    }),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
  };
}

export function preferRoofReport(local: StoredRoofReport | null, remote: StoredRoofReport | null) {
  if (!local) return remote;
  if (!remote) return local;
  return Date.parse(local.updatedAt) >= Date.parse(remote.updatedAt) ? local : remote;
}

export function isMissingRoofReports(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("roof_reports") || message.includes("schema cache") || error.code === "42P01";
}

export function missingRoofReportsMessage() {
  return `Saved in this browser. Run ${ROOF_REPORTS_SQL} in the SQL editor so the drawing stays with the job.`;
}

export async function loadRemoteRoofReport(jobId: string): Promise<
  { ok: true; report: StoredRoofReport | null } | { ok: false; missing: boolean; message: string }
> {
  const supabase = createClient();
  const { data, error } = await supabase.from("roof_reports").select("*").eq("job_id", jobId).maybeSingle();
  if (error) {
    return {
      ok: false,
      missing: isMissingRoofReports(error),
      message: error.message || "Could not load the roof report.",
    };
  }
  return { ok: true, report: data ? fromRow(data as unknown as Record<string, unknown>) : null };
}

export async function saveRemoteRoofReport(input: {
  jobId: string;
  companyId: string;
  report: StoredRoofReport;
}): Promise<{ ok: true; id: string } | { ok: false; missing: boolean; message: string }> {
  if (!UUID_RE.test(input.companyId) || !UUID_RE.test(input.jobId)) {
    return { ok: false, missing: false, message: "Sign in before saving this drawing to the company." };
  }
  const supabase = createClient();
  const payload = {
    company_id: input.companyId,
    job_id: input.jobId,
    status: input.report.status,
    image_path: input.report.imagePath,
    image_width: input.report.imageWidth,
    image_height: input.report.imageHeight,
    feet_per_pixel: input.report.drawing.feetPerPixel,
    waste_percent: input.report.drawing.wastePercent,
    points: input.report.drawing.points as unknown as Json,
    edges: input.report.drawing.edges as unknown as Json,
    facets: input.report.drawing.facets as unknown as Json,
    updated_at: input.report.updatedAt,
  };
  const { data, error } = await supabase
    .from("roof_reports")
    .upsert(payload, { onConflict: "job_id" })
    .select("id")
    .single();
  if (error) {
    return {
      ok: false,
      missing: isMissingRoofReports(error),
      message: error.message || "Could not save the roof report.",
    };
  }
  return { ok: true, id: data.id };
}
