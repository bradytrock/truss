import { NextResponse } from "next/server";
import { requireMapSeat } from "@/lib/map-auth";
import { crewFreshness, parsePresenceBody, visibleCrew, type MapCrewPing } from "@/lib/project-map";
import { isMissingStaffDeviceLocations, missingStormMapMessage } from "@/lib/supabase/schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireMapSeat();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("staff_device_locations")
    .select("staff_id, lat, lng, accuracy, heading, updated_at")
    .eq("company_id", auth.companyId);
  if (error) {
    return NextResponse.json(
      {
        error: isMissingStaffDeviceLocations(error) ? missingStormMapMessage() : error.message,
        missing: isMissingStaffDeviceLocations(error),
        crew: [],
      },
      { status: isMissingStaffDeviceLocations(error) ? 200 : 500 },
    );
  }

  const staffIds = [...new Set((data ?? []).map((row) => row.staff_id))];
  const names = new Map<string, string>();
  if (staffIds.length) {
    const { data: people } = await auth.supabase
      .from("team_members")
      .select("id, name")
      .eq("company_id", auth.companyId)
      .in("id", staffIds);
    for (const person of people ?? []) names.set(person.id, person.name);
  }

  const now = Date.now();
  const crew = visibleCrew(
    (data ?? []).map((row) => ({
      staffId: row.staff_id,
      name: names.get(row.staff_id) || "Field",
      lat: Number(row.lat),
      lng: Number(row.lng),
      accuracy: row.accuracy == null ? null : Number(row.accuracy),
      heading: row.heading == null ? null : Number(row.heading),
      updatedAt: row.updated_at,
    })),
    now,
  ).map((row) => ({ ...row, freshness: crewFreshness(row.updatedAt, now) }));

  return NextResponse.json({ crew });
}

export async function POST(request: Request) {
  const auth = await requireMapSeat();
  if ("error" in auth) return auth.error;
  if (!auth.staffId) {
    return NextResponse.json({ error: "This login is not tied to a seat." }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Could not read that location." }, { status: 400 });
  }
  const parsed = parsePresenceBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const payload = {
    company_id: auth.companyId,
    staff_id: auth.staffId,
    lat: parsed.lat,
    lng: parsed.lng,
    accuracy: parsed.accuracy,
    heading: parsed.heading,
    updated_at: new Date().toISOString(),
  };
  const { error } = await auth.supabase
    .from("staff_device_locations")
    .upsert(payload, { onConflict: "company_id,staff_id" });
  if (error) {
    return NextResponse.json(
      {
        error: isMissingStaffDeviceLocations(error) ? missingStormMapMessage() : error.message,
        missing: isMissingStaffDeviceLocations(error),
      },
      { status: 500 },
    );
  }

  const ping: MapCrewPing = {
    staffId: auth.staffId,
    name: "",
    lat: parsed.lat,
    lng: parsed.lng,
    accuracy: parsed.accuracy,
    heading: parsed.heading,
    updatedAt: payload.updated_at,
  };
  return NextResponse.json({ ok: true, crew: ping });
}
