import { NextResponse } from "next/server";
import { loadProfileCompany } from "@/lib/eagleview-server";
import type { MarketingMaterial } from "@/lib/marketing/types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type UpsertBody = {
  material?: MarketingMaterial;
};

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const body = (await request.json().catch(() => null)) as UpsertBody | null;
  const material = body?.material;
  if (!material?.id || !material.shareToken) {
    return NextResponse.json({ error: "Missing material" }, { status: 400 });
  }

  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile?.company_id) {
    return NextResponse.json({ error: authError || "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase.from("marketing_materials").upsert(
    {
      id: material.id,
      company_id: profile.company_id,
      template_id: material.templateId,
      kind: material.kind,
      name: material.name,
      status: material.status,
      headline: material.headline,
      subhead: material.subhead,
      body: material.body,
      cta: material.cta,
      badge: material.badge,
      accent: material.accent,
      job_id: material.jobId,
      contact_id: material.contactId,
      partner_contact_id: material.partnerContactId,
      photo_urls: material.photoUrls,
      share_token: material.shareToken,
      created_by_staff_id: material.createdByStaffId,
      created_by_name: material.createdByName,
      vanity_slug: material.vanitySlug || "",
      views: material.views,
      downloads: material.downloads,
      shares: material.shares,
      ctas: material.ctas,
      created_at: material.createdAt,
      updated_at: material.updatedAt || new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
