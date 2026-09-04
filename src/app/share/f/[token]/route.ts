import { NextResponse } from "next/server";
import { normalizeShareToken } from "@/lib/share";
import { getObjectFromB2, isB2Configured, isAllowedObjectKey } from "@/lib/storage/b2";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SharedJobFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  storagePath?: string;
  shareToken?: string;
};

/**
 * Public file share. Anyone with the unguessable token can open that one file.
 * Job files stay private on /api/storage/object unless the viewer is signed in.
 */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token: raw } = await context.params;
  const token = normalizeShareToken(raw);
  if (token.length < 16) {
    return NextResponse.json({ error: "Share link not found." }, { status: 404 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Share link not found." }, { status: 404 });
  }
  if (!isB2Configured()) {
    return NextResponse.json({ error: "File storage is not configured." }, { status: 503 });
  }

  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("shared_job_file", { p_token: token });
    if (error || data == null) {
      return NextResponse.json({ error: "Share link not found." }, { status: 404 });
    }
    const file = data as SharedJobFile;
    const path = (file.storagePath || "").replace(/^\/+/, "");
    if (!path || !isAllowedObjectKey(path)) {
      return NextResponse.json({ error: "Share link not found." }, { status: 404 });
    }

    const object = await getObjectFromB2(path);
    if (!object.body) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const bytes = await object.body.transformToByteArray();
    const contentType = file.mimeType || object.contentType || "application/octet-stream";
    const safeName = (file.name || "file").replace(/[\r\n"]/g, "_");
    const inline =
      contentType.startsWith("image/") ||
      contentType === "application/pdf" ||
      contentType.startsWith("text/");

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        ...(object.contentLength != null
          ? { "Content-Length": String(object.contentLength) }
          : {}),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
      },
    });
  } catch (error) {
    console.error("[share/file]", error);
    return NextResponse.json({ error: "Could not open that file." }, { status: 500 });
  }
}
