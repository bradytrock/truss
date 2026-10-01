import { NextResponse } from "next/server";
import { hangupSession, requireCallingUser } from "@/lib/calls/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireCallingUser();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    sessionId?: string;
    disposition?: string;
  } | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) return NextResponse.json({ error: "Missing call session." }, { status: 400 });

  try {
    await hangupSession({
      sessionId,
      disposition: typeof body?.disposition === "string" ? body.disposition : "",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not hang up." },
      { status: 400 },
    );
  }
}
