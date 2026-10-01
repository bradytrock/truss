import { NextResponse } from "next/server";
import { looksLikePhone } from "@/lib/phone";
import { sendOfficeUnsend } from "@/lib/photon-server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to send a text." }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Could not read that request." }, { status: 400 });
  }

  const to = typeof body.to === "string" ? body.to : "";
  const handle = typeof body.handle === "string" ? body.handle : "";
  if (!looksLikePhone(to) || !handle.trim()) {
    return NextResponse.json({ error: "That message cannot be unsent." }, { status: 400 });
  }

  try {
    const result = await sendOfficeUnsend({ to, handle });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      mocked: result.mocked,
      configured: !result.mocked,
      to: result.to,
      handle: result.handle,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not reach Photon." },
      { status: 502 },
    );
  }
}
