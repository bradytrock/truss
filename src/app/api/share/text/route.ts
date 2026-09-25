import { NextResponse } from "next/server";
import { looksLikePhone } from "@/lib/phone";
import { sendText, textProviderStatus } from "@/lib/text-provider";
import { requestOrigin, shareUrlAllowed } from "@/lib/share-text";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await textProviderStatus());
}

export async function POST(request: Request) {
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  try {
    const status = await textProviderStatus();
    const result = await sendText({ to, content, userId: user?.id });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      mocked: result.mocked,
      configured: status.configured || !result.mocked,
      provider: status.provider,
      to: result.to,
      handle: result.handle,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not reach the texting service." },
      { status: 502 },
    );
  }
}
