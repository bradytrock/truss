import { NextResponse } from "next/server";
import { requireMapSeat } from "@/lib/map-auth";
import { dispatchCompanyWeather } from "@/lib/weather/dispatch";
import { isCompanyLeader } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const auth = await requireMapSeat();
  if ("error" in auth) return auth.error;
  if (!isCompanyLeader(auth.role)) {
    return NextResponse.json({ error: "A company admin sends the storm text." }, { status: 403 });
  }
  try {
    const result = await dispatchCompanyWeather(auth.supabase, auth.companyId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The storm text did not send.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
