import { NextResponse } from "next/server";
import { loadProfileCompany } from "@/lib/eagleview-server";
import {
  companyIdFromObjectKey,
  copyObjectInB2,
  isAllowedObjectKey,
  isB2Configured,
  isStorageKind,
  storageObjectKey,
  type StorageKind,
} from "@/lib/storage/b2";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Copy a company-owned B2 object into another key (e.g. directory → job file). */
export async function POST(request: Request) {
  try {
    if (!isB2Configured()) {
      return NextResponse.json({ error: "Backblaze B2 is not configured." }, { status: 503 });
    }

    const supabase = await createClient();
    const { profile, error: authError } = await loadProfileCompany(supabase);
    if (!profile) {
      return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | { fromPath?: string; kind?: string; path?: string; contentType?: string }
      | null;
    const fromPath = (body?.fromPath || "").replace(/^\/+/, "");
    const pathRaw = (body?.path || "").trim();
    const kindRaw = (body?.kind || "").trim();

    if (!fromPath || !isAllowedObjectKey(fromPath)) {
      return NextResponse.json({ error: "Missing source file." }, { status: 400 });
    }
    if (companyIdFromObjectKey(fromPath) !== profile.company_id) {
      return NextResponse.json({ error: "That file is outside your company." }, { status: 403 });
    }
    if (!isStorageKind(kindRaw)) {
      return NextResponse.json({ error: "Unknown storage kind." }, { status: 400 });
    }
    const kind: StorageKind = kindRaw;
    if (!pathRaw) {
      return NextResponse.json({ error: "Missing destination path." }, { status: 400 });
    }

    let destKey: string;
    try {
      destKey = storageObjectKey(profile.company_id, kind, pathRaw);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid destination path." },
        { status: 400 },
      );
    }

    const copied = await copyObjectInB2({
      fromPath,
      companyId: profile.company_id,
      kind,
      path: destKey,
      contentType: typeof body?.contentType === "string" ? body.contentType : undefined,
    });

    return NextResponse.json({
      ok: true,
      kind: copied.kind,
      bucket: copied.bucket,
      storagePath: copied.storagePath,
      path: copied.storagePath,
      url: copied.url,
      publicUrl: copied.url,
    });
  } catch (error) {
    console.error("[storage/copy]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not copy that file." },
      { status: 500 },
    );
  }
}
