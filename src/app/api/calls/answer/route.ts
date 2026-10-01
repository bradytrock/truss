import { NextResponse } from "next/server";
import { answerSoftphoneLeg, requireCallingUser } from "@/lib/calls/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireCallingUser();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { legId?: string } | null;
  const legId = typeof body?.legId === "string" ? body.legId : "";
  if (!legId) return NextResponse.json({ error: "Missing call leg." }, { status: 400 });

  try {
    const result = await answerSoftphoneLeg({
      legId,
      staffId: auth.staffId,
      staffName: auth.fullName,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not answer." },
      { status: 400 },
    );
  }
}
