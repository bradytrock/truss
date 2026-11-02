import type { SupabaseClient } from "@supabase/supabase-js";
import { crewWarningText, lightningText, outlookText, untilLabel } from "./alerts.ts";
import { buildStormDesk, type DeskJob } from "./desk.ts";
import { pointInGeometry } from "./geometry.ts";
import { sendOfficeText } from "@/lib/photon-server";
import type { Database } from "@/lib/supabase/database.types";
import { buildStormLayers } from "./picture.ts";
import type { WeatherAlert } from "./types.ts";

type Db = SupabaseClient<Database>;

const LEADER_ROLES = new Set(["company_admin", "director", "team_lead"]);
const FRESH_MS = 15 * 60 * 1000;

type StaffRow = { id: string; name: string; phone: string; role: string; time_zone: string };

export type DispatchResult = {
  companyId: string;
  texts: number;
  mocked: number;
  skipped: string;
};

export async function dispatchCompanyWeather(supabase: Db, companyId: string, options?: { outlook?: boolean }) {
  const [jobs, crew, staff, ready] = await Promise.all([
    loadJobs(supabase, companyId),
    loadCrew(supabase, companyId),
    loadStaff(supabase, companyId),
    weatherNoticesReady(supabase),
  ]);
  if (!ready) {
    return { companyId, texts: 0, mocked: 0, skipped: "Run the weather migration before scheduled texts go out." } satisfies DispatchResult;
  }
  const points = [
    ...jobs.map((job) => ({ id: job.id, lat: job.lat, lng: job.lng, state: job.state })),
    ...crew.map((person) => ({ id: person.staffId, lat: person.lat, lng: person.lng })),
  ];
  if (!points.length) return { companyId, texts: 0, mocked: 0, skipped: "" } satisfies DispatchResult;
  const layers = await buildStormLayers(points, jobs.map((job) => job.state));
  const desk = buildStormDesk(jobs, layers);
  const staffById = new Map(staff.map((person) => [person.id, person]));
  let texts = 0;
  let mocked = 0;

  for (const alert of layers.alerts) {
    if (alert.route === "map" || !alert.geometry) continue;
    const places = jobs.filter((job) => pointInGeometry(job.lng, job.lat, alert.geometry));
    const crewInside = crew.filter((person) => pointInGeometry(person.lng, person.lat, alert.geometry));
    if (!places.length && !crewInside.length) continue;
    const recipients = new Map<string, string[]>();
    if (alert.route === "sms") {
      for (const job of places) addPlace(recipients, job.ownerStaffId, job.name);
      for (const person of crewInside) addPlace(recipients, person.staffId, "your location");
    } else {
      for (const person of staff) {
        if (LEADER_ROLES.has(person.role)) addPlace(recipients, person.id, places[0]?.name || "the book");
      }
    }
    const sent = await sendGrouped(supabase, companyId, alert.id, recipients, staffById, (names, zone) =>
      crewWarningText({
        event: alert.event,
        until: untilInZone(alert, zone),
        hailInches: alert.hailInches,
        windMph: alert.windMph,
        places: names,
      }),
    );
    texts += sent.texts;
    mocked += sent.mocked;
  }

  const lightningHits = [...layers.lightning].filter((row) => (row.percent ?? 0) >= 40);
  if (lightningHits.length) {
    const recipients = new Map<string, string[]>();
    let peak = 0;
    for (const hit of lightningHits) {
      peak = Math.max(peak, hit.percent ?? 0);
      const job = jobs.find((item) => item.id === hit.id);
      if (job) addPlace(recipients, job.ownerStaffId, job.name);
      if (crew.some((person) => person.staffId === hit.id)) addPlace(recipients, hit.id, "your location");
    }
    const bucket = lightningBucket();
    const sent = await sendGrouped(supabase, companyId, `lightning-${bucket}`, recipients, staffById, (names) =>
      lightningText(peak, names),
    );
    texts += sent.texts;
    mocked += sent.mocked;
  }

  if (options?.outlook !== false && morningWindow() && desk.digest) {
    const hailJobs = desk.impacts.filter((row) => (row.outlookHail ?? 0) >= 0.15 || row.sigHail);
    if (hailJobs.length) {
      const recipients = new Map<string, string[]>();
      for (const person of staff) {
        if (LEADER_ROLES.has(person.role)) recipients.set(person.id, []);
      }
      const cities = unique(hailJobs.map((row) => jobs.find((job) => job.id === row.id)?.city ?? ""));
      const percent = Math.max(...hailJobs.map((row) => row.outlookHail ?? 0));
      const sent = await sendGrouped(
        supabase,
        companyId,
        `outlook-${new Date().toISOString().slice(0, 10)}`,
        recipients,
        staffById,
        () =>
          outlookText({
            jobs: hailJobs.length,
            hailPercent: percent > 0 ? percent : null,
            sigHailJobs: desk.impacts.filter((row) => row.sigHail).length,
            cities,
          }),
      );
      texts += sent.texts;
      mocked += sent.mocked;
    }
  }

  return { companyId, texts, mocked, skipped: "" } satisfies DispatchResult;
}

async function sendGrouped(
  supabase: Db,
  companyId: string,
  sourceId: string,
  recipients: Map<string, string[]>,
  staffById: Map<string, StaffRow>,
  bodyFor: (places: string[], timeZone: string) => string,
) {
  let texts = 0;
  let mocked = 0;
  const noticeId = await ensureNotice(supabase, companyId, sourceId, bodyFor([], "America/Chicago"));
  if (!noticeId) return { texts, mocked };
  const already = await receiptStaff(supabase, noticeId);
  for (const [staffId, places] of recipients) {
    if (already.has(staffId)) continue;
    const person = staffById.get(staffId);
    const phone = person?.phone?.trim() ?? "";
    if (!phone) continue;
    const body = bodyFor(places, person?.time_zone || "America/Chicago");
    const result = await sendOfficeText({ to: phone, content: body });
    if (!result.ok) continue;
    await supabase.from("weather_receipts").insert({ notice_id: noticeId, company_id: companyId, staff_id: staffId });
    texts += 1;
    if (result.mocked) mocked += 1;
  }
  return { texts, mocked };
}

async function ensureNotice(supabase: Db, companyId: string, sourceId: string, body: string) {
  const { data, error } = await supabase
    .from("weather_notices")
    .upsert(
      { company_id: companyId, source_id: sourceId, channel: "sms", headline: body.slice(0, 180), body },
      { onConflict: "company_id,source_id,channel" },
    )
    .select("id")
    .maybeSingle();
  if (error || !data) return "";
  return data.id;
}

async function receiptStaff(supabase: Db, noticeId: string) {
  const { data } = await supabase.from("weather_receipts").select("staff_id").eq("notice_id", noticeId);
  return new Set((data ?? []).map((row) => row.staff_id));
}

async function weatherNoticesReady(supabase: Db) {
  const { error } = await supabase.from("weather_notices").select("id").limit(1);
  if (!error) return true;
  return !/weather_notices|schema cache|does not exist/i.test(error.message);
}

async function loadJobs(supabase: Db, companyId: string): Promise<DeskJob[]> {
  const { data } = await supabase
    .from("jobs")
    .select("id, name, code, city, state, postal_code, status, lat, lng, owner_staff_id, deleted_at")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .not("lat", "is", null)
    .limit(400);
  return (data ?? [])
    .filter((row) => row.lat != null && row.lng != null)
    .map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      city: row.city,
      state: row.state,
      postalCode: row.postal_code,
      status: row.status,
      lat: row.lat as number,
      lng: row.lng as number,
      ownerStaffId: row.owner_staff_id ?? "",
    }));
}

async function loadCrew(supabase: Db, companyId: string) {
  const { data } = await supabase
    .from("staff_device_locations")
    .select("staff_id, lat, lng, updated_at")
    .eq("company_id", companyId);
  const cutoff = Date.now() - FRESH_MS;
  return (data ?? [])
    .filter((row) => new Date(row.updated_at).getTime() >= cutoff)
    .map((row) => ({ staffId: row.staff_id, lat: row.lat, lng: row.lng }));
}

async function loadStaff(supabase: Db, companyId: string): Promise<StaffRow[]> {
  const { data } = await supabase
    .from("team_members")
    .select("id, name, phone, role, time_zone")
    .eq("company_id", companyId);
  return data ?? [];
}

function addPlace(recipients: Map<string, string[]>, staffId: string, place: string) {
  if (!staffId) return;
  const list = recipients.get(staffId) ?? [];
  if (place && !list.includes(place)) list.push(place);
  recipients.set(staffId, list);
}

function untilInZone(alert: WeatherAlert, timeZone: string) {
  if (alert.until) return alert.until;
  return untilLabel("", alert.ends, timeZone || "America/Chicago");
}

function lightningBucket() {
  const now = new Date();
  return `${now.toISOString().slice(0, 10)}-${Math.floor(now.getUTCHours() / 3)}`;
}

function morningWindow() {
  const hour = new Date().getUTCHours();
  return hour >= 11 && hour <= 13;
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    next.push(clean);
  }
  return next;
}
