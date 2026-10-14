import { NextResponse } from "next/server";
import { loadProfileCompany } from "@/lib/eagleview-server";
import { jobSiteQuery } from "@/lib/project-map-logic";
import { parseVerifiedCoords } from "@/lib/roof-measure-satellite";
import { resolveJobCoords, traceSatelliteRoof } from "@/lib/roof-measure-satellite-server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) {
    return NextResponse.json({ error: authError || "Sign in to continue." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    jobId?: string;
    lat?: unknown;
    lng?: unknown;
  } | null;
  const jobId = body?.jobId?.trim() ?? "";
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "That job is not valid." }, { status: 400 });
  }

  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, company_id, street, city, state, postal_code, location, lat, lng")
    .eq("id", jobId)
    .maybeSingle();
  if (error || !job || job.company_id !== profile.company_id) {
    return NextResponse.json({ error: "That job is not in this company." }, { status: 404 });
  }

  const verified = parseVerifiedCoords(body);
  const coords = verified ?? (await resolveJobCoords(job));
  if (!coords) {
    return NextResponse.json(
      { error: "Add the property address on the job before measuring from satellite." },
      { status: 400 },
    );
  }

  if (verified) {
    const queryText = jobSiteQuery({
      street: job.street ?? "",
      city: job.city ?? "",
      state: job.state ?? "",
      postalCode: job.postal_code ?? "",
      location: job.location ?? "",
    });
    await supabase
      .from("jobs")
      .update({
        lat: verified.lat,
        lng: verified.lng,
        geocoded_at: new Date().toISOString(),
        ...(queryText ? { geocode_query: queryText } : {}),
      })
      .eq("id", jobId)
      .eq("company_id", profile.company_id);
  }

  const traced = await traceSatelliteRoof({
    lat: coords.lat,
    lng: coords.lng,
    companyId: profile.company_id,
    jobId,
  });
  if (!traced.ok) {
    return NextResponse.json({ error: traced.error }, { status: 502 });
  }
  return NextResponse.json(traced.result);
}
