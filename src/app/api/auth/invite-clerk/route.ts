import { NextResponse } from "next/server";
import { openInviteClerkLogin } from "@/lib/clerk-seat-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Could not read that request." }, { status: 400 });
  }

  const result = await openInviteClerkLogin({
    token: typeof body.token === "string" ? body.token : "",
    password: typeof body.password === "string" ? body.password : "",
    fullName: typeof body.fullName === "string" ? body.fullName : "",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  if ("skipped" in result) return NextResponse.json({ skipped: true });
  return NextResponse.json({ ticket: result.ticket });
}
