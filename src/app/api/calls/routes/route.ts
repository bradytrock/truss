import { NextResponse } from "next/server";
import { requireCallingUser } from "@/lib/calls/server";
import { storedPhone } from "@/lib/phone";
import { isMissingCalling, missingCallingMessage } from "@/lib/supabase/schema-errors";
import type { SeatRole } from "@/lib/types";
import { canManageSettings } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const auth = await requireCallingUser();
  if ("error" in auth) return { error: NextResponse.json({ error: auth.error }, { status: 401 }) };
  if (!canManageSettings(auth.role as SeatRole)) {
    return { error: NextResponse.json({ error: "Only a company admin can manage routes." }, { status: 403 }) };
  }
  return auth;
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("call_routes")
    .select("*")
    .eq("company_id", auth.companyId)
    .order("priority");
  if (error) {
    return NextResponse.json(
      {
        error: isMissingCalling(error) ? missingCallingMessage() : error.message,
        missing: isMissingCalling(error),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    routes: (data ?? []).map((row) => ({
      id: row.id,
      matchNumber: row.match_number,
      targetType: row.target_type,
      targetQueueId: row.target_queue_id,
      targetStaffId: row.target_staff_id,
      priority: row.priority,
      enabled: row.enabled,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    matchNumber?: string;
    targetType?: "queue" | "staff";
    targetQueueId?: string | null;
    targetStaffId?: string | null;
    priority?: number;
    enabled?: boolean;
    delete?: boolean;
  } | null;

  if (body?.delete && body.id) {
    const { error } = await auth.supabase
      .from("call_routes")
      .delete()
      .eq("company_id", auth.companyId)
      .eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const targetType = body?.targetType;
  if (targetType !== "queue" && targetType !== "staff") {
    return NextResponse.json({ error: "Route to a queue or a seat." }, { status: 400 });
  }
  if (targetType === "queue" && !body?.targetQueueId) {
    return NextResponse.json({ error: "Pick a queue." }, { status: 400 });
  }
  if (targetType === "staff" && !body?.targetStaffId) {
    return NextResponse.json({ error: "Pick a seat." }, { status: 400 });
  }

  const payload = {
    company_id: auth.companyId,
    match_number: storedPhone(typeof body?.matchNumber === "string" ? body.matchNumber : "") || "",
    target_type: targetType,
    target_queue_id: targetType === "queue" ? body?.targetQueueId ?? null : null,
    target_staff_id: targetType === "staff" ? body?.targetStaffId ?? null : null,
    priority: typeof body?.priority === "number" ? body.priority : 100,
    enabled: body?.enabled !== false,
    updated_at: new Date().toISOString(),
  };

  if (body?.id) {
    const { error } = await auth.supabase
      .from("call_routes")
      .update(payload)
      .eq("company_id", auth.companyId)
      .eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: body.id });
  }

  const { data, error } = await auth.supabase.from("call_routes").insert(payload).select("id").single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Could not save." }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id });
}
