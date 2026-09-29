import { NextResponse } from "next/server";
import {
  loadCompanyCamConnection,
  loadCompanyCamLink,
  pushJobPhotoToCompanyCam,
  removeJobPhotoFromCompanyCam,
} from "@/lib/companycam-server";
import { isUuid } from "@/lib/companycam";
import { loadProfileCompany } from "@/lib/eagleview-server";
import { createClient } from "@/lib/supabase/server";
import { isMissingCompanyCam, missingCompanyCamMessage } from "@/lib/supabase/schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { photoId?: string; action?: string } | null;
  const photoId = body?.photoId?.trim() || "";
  const action = body?.action?.trim() || "";
  if (!isUuid(photoId)) return NextResponse.json({ error: "That photo was not found." }, { status: 404 });
  if (action !== "push" && action !== "remove") {
    return NextResponse.json({ error: "Unknown CompanyCam photo action." }, { status: 400 });
  }

  const { data: photo, error: photoError } = await supabase
    .from("job_photos")
    .select("id, job_id, image_url, caption, taken_at, companycam_photo_id, created_by, deleted_at")
    .eq("company_id", profile.company_id)
    .eq("id", photoId)
    .maybeSingle();
  if (photoError) {
    if (isMissingCompanyCam(photoError)) {
      return NextResponse.json({ error: missingCompanyCamMessage() }, { status: 400 });
    }
    return NextResponse.json({ error: photoError.message }, { status: 400 });
  }
  if (!photo) return NextResponse.json({ error: "That photo was not found." }, { status: 404 });

  const { row, error } = await loadCompanyCamConnection(supabase, profile.company_id);
  if (error) {
    if (isMissingCompanyCam(error)) return NextResponse.json({ ok: true, skipped: true, reason: "not_connected" });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const token = row?.linked ? row.access_token.trim() : "";
  if (!token) return NextResponse.json({ ok: true, skipped: true, reason: "not_connected" });

  const linkResult = await loadCompanyCamLink(supabase, profile.company_id, photo.job_id);
  if (linkResult.error || !linkResult.row) {
    return NextResponse.json({ ok: true, skipped: true, reason: "not_linked" });
  }

  if (action === "remove") {
    const removed = await removeJobPhotoFromCompanyCam(token, photo.companycam_photo_id ?? "");
    if (!removed.ok) return NextResponse.json({ error: removed.error }, { status: 400 });
    return NextResponse.json({ ok: true, skipped: removed.skipped });
  }

  if (photo.deleted_at) return NextResponse.json({ ok: true, skipped: true, reason: "trashed" });
  const pushed = await pushJobPhotoToCompanyCam(supabase, {
    token,
    companyId: profile.company_id,
    projectId: linkResult.row.companycam_project_id,
    photo: {
      id: photo.id,
      image_url: photo.image_url,
      caption: photo.caption,
      taken_at: photo.taken_at,
      companycam_photo_id: photo.companycam_photo_id ?? "",
      created_by: photo.created_by,
    },
  });
  if (!pushed.ok) return NextResponse.json({ error: pushed.error }, { status: 400 });
  return NextResponse.json({
    ok: true,
    skipped: pushed.skipped,
    companyCamPhotoId: pushed.companyCamPhotoId,
  });
}
