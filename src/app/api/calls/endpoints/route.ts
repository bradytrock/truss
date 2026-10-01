import { NextResponse } from "next/server";
import { requireCallingUser } from "@/lib/calls/server";
import { storedPhone } from "@/lib/phone";
import { isMissingCalling, missingCallingMessage } from "@/lib/supabase/schema-errors";
import type { SeatRole } from "@/lib/types";
import { canManageSettings } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireCallingUser();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 401 });

  const url = new URL(request.url);
  const staffId = url.searchParams.get("staffId") || auth.staffId;
  const admin = canManageSettings(auth.role as SeatRole);
  if (staffId !== auth.staffId && !admin) {
    return NextResponse.json({ error: "Only an admin can view another seat's endpoints." }, { status: 403 });
  }

  await auth.supabase.rpc("calling_ensure_default_endpoints", { p_staff_id: staffId });

  const { data, error } = await auth.supabase
    .from("call_endpoints")
    .select("*")
    .eq("company_id", auth.companyId)
    .eq("staff_id", staffId)
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
    endpoints: (data ?? []).map((row) => ({
      id: row.id,
      staffId: row.staff_id,
      kind: row.kind,
      phone: row.phone,
      enabled: row.enabled,
      priority: row.priority,
      ringTimeoutSeconds: row.ring_timeout_seconds,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireCallingUser();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    staffId?: string;
    kind?: "softphone" | "cell" | "app";
    phone?: string;
    enabled?: boolean;
    priority?: number;
    ringTimeoutSeconds?: number;
  } | null;

  const staffId = typeof body?.staffId === "string" ? body.staffId : auth.staffId;
  const admin = canManageSettings(auth.role as SeatRole);
  if (staffId !== auth.staffId && !admin) {
    return NextResponse.json({ error: "Only an admin can edit another seat's endpoints." }, { status: 403 });
  }
  const kind = body?.kind;
  if (kind !== "softphone" && kind !== "cell" && kind !== "app") {
    return NextResponse.json({ error: "Pick softphone, cell, or app." }, { status: 400 });
  }

  const payload = {
    company_id: auth.companyId,
    staff_id: staffId,
    kind,
    phone: kind === "cell" ? storedPhone(typeof body?.phone === "string" ? body.phone : "") : "",
    enabled: body?.enabled !== false,
    priority: typeof body?.priority === "number" ? body.priority : 100,
    ring_timeout_seconds:
      typeof body?.ringTimeoutSeconds === "number" ? body.ringTimeoutSeconds : 25,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await auth.supabase
    .from("call_endpoints")
    .upsert(payload, { onConflict: "staff_id,kind" })
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json(
      {
        error: isMissingCalling(error) ? missingCallingMessage() : error?.message || "Could not save.",
        missing: isMissingCalling(error),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    endpoint: {
      id: data.id,
      staffId: data.staff_id,
      kind: data.kind,
      phone: data.phone,
      enabled: data.enabled,
      priority: data.priority,
      ringTimeoutSeconds: data.ring_timeout_seconds,
    },
  });
}
