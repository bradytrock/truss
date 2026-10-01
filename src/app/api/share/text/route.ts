import { NextResponse } from "next/server";
import { looksLikePhone } from "@/lib/phone";
import { officePhotonConfigured, sendOfficeText } from "@/lib/photon-server";
import { requestOrigin, shareUrlAllowed } from "@/lib/share-text";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ configured: false });
  const status = await officePhotonConfigured();
  return NextResponse.json(status);
}

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
  const content = typeof body.content === "string" ? body.content : "";
  const url = typeof body.url === "string" ? body.url : "";

  if (!looksLikePhone(to)) {
    return NextResponse.json({ error: "Enter a valid mobile number." }, { status: 400 });
  }
  if (!content.trim()) {
    return NextResponse.json({ error: "Write a message before sending." }, { status: 400 });
  }
  if (!shareUrlAllowed(url, requestOrigin(request))) {
    return NextResponse.json({ error: "That share link does not belong to this app." }, { status: 400 });
  }
  if (!content.includes(url)) {
    return NextResponse.json({ error: "The text has to include the share link." }, { status: 400 });
  }

  try {
    const result = await sendOfficeText({ to, content });
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
