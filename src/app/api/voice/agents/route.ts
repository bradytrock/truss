import { NextResponse } from "next/server";
import { mintVoiceWebhookToken } from "@/lib/voice-agent";
import { storedPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { isMissingVoiceAgents, missingVoiceAgentsMessage } from "@/lib/supabase/schema-errors";
import { canManageSettings } from "@/lib/visibility";
import type { SeatRole } from "@/lib/types";

export const runtime = "nodejs";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in." }, { status: 401 }) };
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role, staff_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.company_id) {
    return { error: NextResponse.json({ error: "No company on this seat." }, { status: 403 }) };
  }
  if (!canManageSettings((profile.role ?? "project_manager") as SeatRole)) {
    return { error: NextResponse.json({ error: "Only a company admin can set voice agents." }, { status: 403 }) };
  }
  return { supabase, companyId: profile.company_id as string };
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.supabase
    .from("voice_agents")
    .select("*")
    .eq("company_id", auth.companyId)
    .order("created_at");
  if (error) {
    return NextResponse.json(
      {
        error: isMissingVoiceAgents(error) ? missingVoiceAgentsMessage() : error.message,
        missing: isMissingVoiceAgents(error),
      },
      { status: 500 },
    );
  }
  return NextResponse.json({
    agents: (data ?? []).map((row) => ({
      id: row.id,
      staffId: row.staff_id,
      elevenlabsAgentId: row.elevenlabs_agent_id,
      inboundNumber: row.inbound_number,
      webhookToken: row.webhook_token,
      enabled: row.enabled,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Could not read that request." }, { status: 400 });
  }
  const staffId = typeof body.staffId === "string" ? body.staffId : "";
  if (!staffId) return NextResponse.json({ error: "Pick a project manager." }, { status: 400 });

  const { data: existing } = await auth.supabase
    .from("voice_agents")
    .select("webhook_token")
    .eq("company_id", auth.companyId)
    .eq("staff_id", staffId)
    .maybeSingle();

  const payload = {
    company_id: auth.companyId,
    staff_id: staffId,
    elevenlabs_agent_id: typeof body.elevenlabsAgentId === "string" ? body.elevenlabsAgentId.trim() : "",
    inbound_number: storedPhone(typeof body.inboundNumber === "string" ? body.inboundNumber : ""),
    webhook_token: existing?.webhook_token || mintVoiceWebhookToken(),
    enabled: body.enabled !== false,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await auth.supabase
    .from("voice_agents")
    .upsert(payload, { onConflict: "staff_id" })
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json(
      {
        error: isMissingVoiceAgents(error) ? missingVoiceAgentsMessage() : (error?.message ?? "Could not save the voice agent."),
        missing: isMissingVoiceAgents(error),
      },
      { status: 500 },
    );
  }
  return NextResponse.json({
    agent: {
      id: data.id,
      staffId: data.staff_id,
      elevenlabsAgentId: data.elevenlabs_agent_id,
      inboundNumber: data.inbound_number,
      webhookToken: data.webhook_token,
      enabled: data.enabled,
    },
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Could not read that request." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Missing voice agent." }, { status: 400 });

  const patch: {
    updated_at: string;
    elevenlabs_agent_id?: string;
    inbound_number?: string;
    enabled?: boolean;
    webhook_token?: string;
  } = { updated_at: new Date().toISOString() };
  if (typeof body.elevenlabsAgentId === "string") patch.elevenlabs_agent_id = body.elevenlabsAgentId.trim();
  if (typeof body.inboundNumber === "string") patch.inbound_number = storedPhone(body.inboundNumber);
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (body.rotateToken === true) patch.webhook_token = mintVoiceWebhookToken();

  const { data, error } = await auth.supabase
    .from("voice_agents")
    .update(patch)
    .eq("id", id)
    .eq("company_id", auth.companyId)
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not update the voice agent." }, { status: 500 });
  }
  return NextResponse.json({
    agent: {
      id: data.id,
      staffId: data.staff_id,
      elevenlabsAgentId: data.elevenlabs_agent_id,
      inboundNumber: data.inbound_number,
      webhookToken: data.webhook_token,
      enabled: data.enabled,
    },
  });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "Missing voice agent." }, { status: 400 });
  const { error } = await auth.supabase.from("voice_agents").delete().eq("id", id).eq("company_id", auth.companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
