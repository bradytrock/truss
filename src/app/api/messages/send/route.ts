import { NextResponse } from "next/server";
import { looksLikePhone } from "@/lib/phone";
import { isSendblueConfiguredLocally, sendblueStatus, sendblueText } from "@/lib/sendblue";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await sendblueStatus());
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
  if (!looksLikePhone(to)) {
    return NextResponse.json({ error: "Enter a valid mobile number." }, { status: 400 });
  }
  if (!content.trim()) {
    return NextResponse.json({ error: "Write a message before sending." }, { status: 400 });
  }

  try {
    const result = await sendblueText({ to, content });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      mocked: result.mocked,
      configured: isSendblueConfiguredLocally() || !result.mocked,
      to: result.to,
      handle: result.handle,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not reach Sendblue." },
      { status: 502 },
    );
  }
}
