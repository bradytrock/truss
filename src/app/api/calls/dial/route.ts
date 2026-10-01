import { NextResponse } from "next/server";
import { placeOutboundCall, requireCallingUser } from "@/lib/calls/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireCallingUser();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { to?: string } | null;
  const to = typeof body?.to === "string" ? body.to : "";
  if (!to) return NextResponse.json({ error: "Enter a number to dial." }, { status: 400 });

  try {
    const result = await placeOutboundCall({
      companyId: auth.companyId,
      staffId: auth.staffId,
      staffName: auth.fullName,
      toNumber: to,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not place the call." },
      { status: 400 },
    );
  }
}
