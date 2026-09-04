import { NextResponse } from "next/server";
import { loadProfileCompany } from "@/lib/eagleview-server";
import { normalizeShareToken } from "@/lib/share";
import {
  companyIdFromObjectKey,
  getObjectFromB2,
  isAllowedObjectKey,
  isB2Configured,
  storageKindFromObjectKey,
} from "@/lib/storage/b2";
import { createAnonClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams a B2 object.
 *
 * Access rules:
 * - `company-assets` (logos) — readable without a session (needed on share pages / cards)
 * - everything else — signed-in user whose company owns the object key, OR a valid
 *   `share` query token (file share, or estimate/invoice/page share for that job)
 */
export async function GET(request: Request) {
  try {
    if (!isB2Configured()) {
      return NextResponse.json({ error: "Backblaze B2 is not configured." }, { status: 503 });
    }

    const url = new URL(request.url);
    const path = (url.searchParams.get("path") || "").replace(/^\/+/, "");
    if (!path || path.includes("..")) {
      return NextResponse.json({ error: "Missing file path." }, { status: 400 });
    }

    if (!isAllowedObjectKey(path)) {
      return NextResponse.json({ error: "Unknown storage path." }, { status: 404 });
    }

    const kind = storageKindFromObjectKey(path);
    const companyId = companyIdFromObjectKey(path);
    const shareToken = normalizeShareToken(url.searchParams.get("share"));

    let allowed = kind === "company-assets";

    if (!allowed && companyId) {
      const supabase = await createClient();
      const { profile } = await loadProfileCompany(supabase);
      if (profile?.company_id === companyId) {
        allowed = true;
      }
    }

    if (!allowed && shareToken) {
      try {
        const anon = createAnonClient();
        const { data, error } = await anon.rpc("storage_share_access", {
          p_token: shareToken,
          p_path: path,
        });
        if (!error && data === true) allowed = true;
      } catch (error) {
        console.error("[storage/object] share access", error);
      }
    }

    if (!allowed) {
      return NextResponse.json(
        { error: "Sign in to view this file, or use a share link." },
        { status: 401 },
      );
    }

    const object = await getObjectFromB2(path);
    if (!object.body) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const bytes = await object.body.transformToByteArray();
    const privateAsset = kind !== "company-assets";
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": object.contentType,
        ...(object.contentLength != null
          ? { "Content-Length": String(object.contentLength) }
          : {}),
        "Cache-Control": privateAsset
          ? "private, max-age=3600"
          : object.cacheControl || "public, max-age=86400",
        ...(privateAsset ? { "X-Content-Type-Options": "nosniff" } : {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read that file.";
    const missing = /NoSuchKey|NotFound|404|Key not found|NoSuchBucket/i.test(message);
    console.error("[storage/object]", error);
    return NextResponse.json(
      { error: missing ? "File not found." : message },
      { status: missing ? 404 : 500 },
    );
  }
}
