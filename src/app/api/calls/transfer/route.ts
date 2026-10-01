import { NextResponse } from "next/server";
import {
  coldTransfer,
  completeWarmTransfer,
  requireCallingUser,
  warmTransfer,
} from "@/lib/calls/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireCallingUser();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    sessionId?: string;
    mode?: "cold" | "warm" | "complete-warm";
    targetStaffId?: string;
    targetNumber?: string;
  } | null;

  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) return NextResponse.json({ error: "Missing call session." }, { status: 400 });
  const mode = body?.mode ?? "cold";

  try {
    if (mode === "warm") {
      if (!body?.targetStaffId) {
        return NextResponse.json({ error: "Pick a teammate for the warm transfer." }, { status: 400 });
      }
      const result = await warmTransfer({
        sessionId,
        staffId: auth.staffId,
        staffName: auth.fullName,
        targetStaffId: body.targetStaffId,
      });
      return NextResponse.json(result);
    }
    if (mode === "complete-warm") {
      if (!body?.targetStaffId) {
        return NextResponse.json({ error: "Pick the teammate who will take the call." }, { status: 400 });
      }
      const result = await completeWarmTransfer({
        sessionId,
        targetStaffId: body.targetStaffId,
      });
      return NextResponse.json(result);
    }
    const result = await coldTransfer({
      sessionId,
      targetStaffId: typeof body?.targetStaffId === "string" ? body.targetStaffId : undefined,
      targetNumber: typeof body?.targetNumber === "string" ? body.targetNumber : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not transfer." },
      { status: 400 },
    );
  }
}
