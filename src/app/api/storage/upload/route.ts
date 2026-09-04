import { NextResponse } from "next/server";
import {
  isB2Configured,
  isStorageKind,
  removeFromB2,
  uploadToB2,
  b2Status,
  type StorageKind,
} from "@/lib/storage/b2";
import { loadProfileCompany } from "@/lib/eagleview-server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json(b2Status());
}

function companyScopedPath(companyId: string, path: string) {
  const clean = path.replace(/^\/+/, "");
  if (!clean.startsWith(`${companyId}/`)) {
    return null;
  }
  return clean;
}

export async function POST(request: Request) {
  try {
    if (!isB2Configured()) {
      return NextResponse.json(
        {
          error:
            "Backblaze B2 is not configured on this host. Add B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET, and B2_REGION.",
        },
        { status: 503 },
      );
    }

    const supabase = await createClient();
    const { profile, error: authError } = await loadProfileCompany(supabase);
    if (!profile) {
      return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });
    }

    const form = await request.formData();
    const kindRaw = String(form.get("kind") ?? "").trim();
    const pathRaw = String(form.get("path") ?? "").trim();
    const file = form.get("file");

    if (!isStorageKind(kindRaw)) {
      return NextResponse.json({ error: "Unknown storage kind." }, { status: 400 });
    }
    const kind: StorageKind = kindRaw;
    const path = companyScopedPath(profile.company_id, pathRaw);
    if (!path) {
      return NextResponse.json(
        { error: "Upload path must be under your company folder." },
        { status: 400 },
      );
    }
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
    }
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "That file is over 25 MB." }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadToB2({
      kind,
      path,
      body: buffer,
      contentType: file.type || "application/octet-stream",
      appOrigin: origin,
    });

    return NextResponse.json({
      ok: true,
      kind: uploaded.kind,
      bucket: uploaded.bucket,
      storagePath: uploaded.storagePath,
      path: uploaded.storagePath,
      url: uploaded.url,
      publicUrl: uploaded.url,
      contentType: file.type || "application/octet-stream",
      size: file.size,
    });
  } catch (error) {
    console.error("[storage/upload]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not upload that file.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
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
      | { path?: string; kind?: string }
      | null;
    const pathRaw = typeof body?.path === "string" ? body.path.trim() : "";
    if (!pathRaw) {
      return NextResponse.json({ error: "Missing file path." }, { status: 400 });
    }

    // Accept either full object key (kind/companyId/...) or legacy company-relative path.
    const allowed =
      pathRaw.includes(`/${profile.company_id}/`) ||
      pathRaw.startsWith(`${profile.company_id}/`) ||
      (body?.kind &&
        isStorageKind(body.kind) &&
        pathRaw.startsWith(`${body.kind}/${profile.company_id}/`));

    if (!allowed) {
      return NextResponse.json({ error: "That file is outside your company." }, { status: 403 });
    }

    await removeFromB2({
      kind: typeof body?.kind === "string" ? body.kind : undefined,
      path: pathRaw,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[storage/delete]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not delete that file.",
      },
      { status: 500 },
    );
  }
}
