import { NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/geocode-server";
import { requireMapSeat } from "@/lib/map-auth";
import { addressNeedsGeocode, GEOCODE_BATCH, jobSiteQuery } from "@/lib/project-map";
import { isMissingJobCoords, missingStormMapMessage } from "@/lib/supabase/schema-errors";
import { isDeletedJob } from "@/lib/job-record";
import type { Job } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JobGeoRow = {
  id: string;
  street: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  geocode_query: string | null;
  deleted_at: string | null;
};

export async function POST(request: Request) {
  const auth = await requireMapSeat();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const requested = Array.isArray(body.jobIds)
    ? body.jobIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];

  const select = "id, street, city, state, postal_code, location, lat, lng, geocode_query, deleted_at";
  let query = auth.supabase.from("jobs").select(select).eq("company_id", auth.companyId);
  if (requested.length) query = query.in("id", requested.slice(0, 40));
  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      {
        error: isMissingJobCoords(error) ? missingStormMapMessage() : error.message,
        missing: isMissingJobCoords(error),
        jobs: [],
      },
      { status: isMissingJobCoords(error) ? 200 : 500 },
    );
  }

  const pending = ((data ?? []) as JobGeoRow[])
    .map((row) => ({
      id: row.id,
      street: row.street ?? "",
      city: row.city ?? "",
      state: row.state ?? "",
      postalCode: row.postal_code ?? "",
      location: row.location ?? "",
      lat: row.lat,
      lng: row.lng,
      geocodeQuery: row.geocode_query ?? "",
      deletedAt: row.deleted_at,
    }))
    .filter((job) => !isDeletedJob(job as Pick<Job, "deletedAt">) && addressNeedsGeocode(job))
    .slice(0, GEOCODE_BATCH);

  const mapped: Array<{
    id: string;
    lat: number;
    lng: number;
    geocodeQuery: string;
    geocodedAt: string;
  }> = [];

  for (const job of pending) {
    const queryText = jobSiteQuery(job);
    const hit = await geocodeAddress(queryText);
    if (!hit) continue;
    const geocodedAt = new Date().toISOString();
    const { error: writeError } = await auth.supabase
      .from("jobs")
      .update({
        lat: hit.lat,
        lng: hit.lng,
        geocode_query: queryText,
        geocoded_at: geocodedAt,
      })
      .eq("id", job.id)
      .eq("company_id", auth.companyId);
    if (writeError) {
      return NextResponse.json(
        {
          error: isMissingJobCoords(writeError) ? missingStormMapMessage() : writeError.message,
          missing: isMissingJobCoords(writeError),
          jobs: mapped,
        },
        { status: isMissingJobCoords(writeError) ? 200 : 500 },
      );
    }
    mapped.push({ id: job.id, lat: hit.lat, lng: hit.lng, geocodeQuery: queryText, geocodedAt });
  }

  return NextResponse.json({ jobs: mapped, remaining: Math.max(0, pending.length - mapped.length) });
}
