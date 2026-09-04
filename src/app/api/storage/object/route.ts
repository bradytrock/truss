import { NextResponse } from "next/server";
import { getObjectFromB2, isB2Configured } from "@/lib/storage/b2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams a B2 object. Used when the bucket is private (Backblaze requires a
 * payment history before public buckets). Object keys include company UUIDs so
 * they are not guessable; prefer making the bucket public + B2_PUBLIC_BASE_URL
 * once the Backblaze account can enable public reads.
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

    // Only serve known kind prefixes.
    const allowed = ["job-files/", "job-photos/", "receipts/", "company-assets/"];
    if (!allowed.some((prefix) => path.startsWith(prefix))) {
      return NextResponse.json({ error: "Unknown storage path." }, { status: 404 });
    }

    const object = await getObjectFromB2(path);
    if (!object.body) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const bytes = await object.body.transformToByteArray();
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": object.contentType,
        ...(object.contentLength != null
          ? { "Content-Length": String(object.contentLength) }
          : {}),
        "Cache-Control": object.cacheControl || "public, max-age=86400",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read that file.";
    const missing = /NoSuchKey|NotFound|404/i.test(message);
    console.error("[storage/object]", error);
    return NextResponse.json(
      { error: missing ? "File not found." : message },
      { status: missing ? 404 : 500 },
    );
  }
}
