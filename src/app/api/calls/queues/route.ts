import { NextResponse } from "next/server";
import { requireCallingUser } from "@/lib/calls/server";
import { isMissingCalling, missingCallingMessage } from "@/lib/supabase/schema-errors";
import type { SeatRole } from "@/lib/types";
import { canManageSettings } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const auth = await requireCallingUser();
  if ("error" in auth) return { error: NextResponse.json({ error: auth.error }, { status: 401 }) };
  if (!canManageSettings(auth.role as SeatRole)) {
    return { error: NextResponse.json({ error: "Only a company admin can manage queues." }, { status: 403 }) };
  }
  return auth;
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { data: queues, error } = await auth.supabase
    .from("call_queues")
    .select("*")
    .eq("company_id", auth.companyId)
    .order("name");
  if (error) {
    return NextResponse.json(
      {
        error: isMissingCalling(error) ? missingCallingMessage() : error.message,
        missing: isMissingCalling(error),
      },
      { status: 500 },
    );
  }

  const { data: members } = await auth.supabase
    .from("call_queue_members")
    .select("*")
    .eq("company_id", auth.companyId);

  return NextResponse.json({
    queues: (queues ?? []).map((queue) => ({
      id: queue.id,
      name: queue.name,
      strategy: queue.strategy,
      fallback: queue.fallback,
      fallbackVoiceAgentStaffId: queue.fallback_voice_agent_staff_id,
      ringTimeoutSeconds: queue.ring_timeout_seconds,
      enabled: queue.enabled,
      members: (members ?? [])
        .filter((member) => member.queue_id === queue.id)
        .map((member) => ({
          id: member.id,
          staffId: member.staff_id,
          useSoftphone: member.use_softphone,
          useCell: member.use_cell,
          useApp: member.use_app,
        })),
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    name?: string;
    fallback?: "none" | "missed_log" | "voice_agent";
    fallbackVoiceAgentStaffId?: string | null;
    ringTimeoutSeconds?: number;
    enabled?: boolean;
    members?: Array<{
      staffId: string;
      useSoftphone?: boolean;
      useCell?: boolean;
      useApp?: boolean;
    }>;
    delete?: boolean;
  } | null;

  if (body?.delete && body.id) {
    const { error } = await auth.supabase
      .from("call_queues")
      .delete()
      .eq("company_id", auth.companyId)
      .eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name the queue." }, { status: 400 });

  const payload = {
    company_id: auth.companyId,
    name,
    strategy: "simultaneous" as const,
    fallback: body?.fallback === "none" || body?.fallback === "voice_agent" ? body.fallback : "missed_log",
    fallback_voice_agent_staff_id: body?.fallbackVoiceAgentStaffId || null,
    ring_timeout_seconds: typeof body?.ringTimeoutSeconds === "number" ? body.ringTimeoutSeconds : 25,
    enabled: body?.enabled !== false,
    updated_at: new Date().toISOString(),
  };

  let queueId = typeof body?.id === "string" ? body.id : "";
  if (queueId) {
    const { data, error } = await auth.supabase
      .from("call_queues")
      .update(payload)
      .eq("company_id", auth.companyId)
      .eq("id", queueId)
      .select("*")
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message || "Could not save." }, { status: 400 });
    queueId = data.id;
  } else {
    const { data, error } = await auth.supabase
      .from("call_queues")
      .insert(payload)
      .select("*")
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message || "Could not save." }, { status: 400 });
    queueId = data.id;
  }

  if (Array.isArray(body?.members)) {
    await auth.supabase.from("call_queue_members").delete().eq("queue_id", queueId);
    if (body.members.length) {
      const { error } = await auth.supabase.from("call_queue_members").insert(
        body.members.map((member) => ({
          company_id: auth.companyId,
          queue_id: queueId,
          staff_id: member.staffId,
          use_softphone: member.useSoftphone !== false,
          use_cell: member.useCell !== false,
          use_app: member.useApp !== false,
        })),
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, id: queueId });
}
