import { NextResponse } from "next/server";
import { callingHostStatus, callingWebhookUrl } from "@/lib/calls/config";
import {
  ensureInboundDispatchRule,
  ensurePhotonInboundTrunk,
  ensurePhotonOutboundTrunk,
  liveKitConfigured,
} from "@/lib/calls/livekit";
import { loadProfileCompany } from "@/lib/eagleview-server";
import { toE164 } from "@/lib/phone";
import { requestOrigin } from "@/lib/share-text";
import { createClient } from "@/lib/supabase/server";
import { isMissingCalling, missingCallingMessage } from "@/lib/supabase/schema-errors";
import type { SeatRole } from "@/lib/types";
import { canManageSettings } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });
  const role = (profile.role as SeatRole | undefined) ?? "project_manager";
  if (!canManageSettings(role)) {
    return NextResponse.json({ error: "Only a company admin can view calling settings." }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("calling_company_status");
  if (error) {
    if (isMissingCalling(error)) {
      return NextResponse.json({ linked: false, sql: missingCallingMessage(), ...callingHostStatus() });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const status = asRecord(data) ?? {};
  if (status.ok === false) {
    return NextResponse.json({ error: status.error || "Could not load calling." }, { status: 400 });
  }

  const { data: photon } = await supabase.rpc("photon_company_status");
  const photonRow = asRecord(photon) ?? {};
  const webhookToken = typeof status.webhookToken === "string" ? status.webhookToken : "";

  return NextResponse.json({
    ...callingHostStatus(),
    enabled: Boolean(status.enabled),
    configured: Boolean(status.configured),
    companyName: status.companyName ?? "",
    officeLine: status.officeLine ?? "",
    livekitOutboundTrunkId: status.livekitOutboundTrunkId ?? "",
    livekitInboundTrunkId: status.livekitInboundTrunkId ?? "",
    livekitDispatchRuleId: status.livekitDispatchRuleId ?? "",
    webhookUrl: callingWebhookUrl(requestOrigin(request), webhookToken),
    photonLinked: Boolean(photonRow.linked),
    photonProjectId: photonRow.projectId ?? "",
    sql: null,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });
  const role = (profile.role as SeatRole | undefined) ?? "project_manager";
  if (!canManageSettings(role)) {
    return NextResponse.json({ error: "Only a company admin can change calling settings." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    enabled?: boolean;
    officeLine?: string;
    provisionTrunks?: boolean;
  } | null;

  const officeLine = toE164(typeof body?.officeLine === "string" ? body.officeLine : "");
  let outboundTrunkId = "";
  let inboundTrunkId = "";
  let dispatchRuleId = "";

  const { data: current } = await supabase.rpc("calling_company_status");
  const currentRow = asRecord(current) ?? {};
  outboundTrunkId =
    typeof currentRow.livekitOutboundTrunkId === "string" ? currentRow.livekitOutboundTrunkId : "";
  inboundTrunkId =
    typeof currentRow.livekitInboundTrunkId === "string" ? currentRow.livekitInboundTrunkId : "";
  dispatchRuleId =
    typeof currentRow.livekitDispatchRuleId === "string" ? currentRow.livekitDispatchRuleId : "";

  if (body?.provisionTrunks) {
    if (!liveKitConfigured()) {
      return NextResponse.json(
        { error: "Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET on the host first." },
        { status: 400 },
      );
    }
    if (!officeLine) {
      return NextResponse.json({ error: "Set the office calling line before provisioning trunks." }, { status: 400 });
    }
    const { data: photonCreds, error: photonError } = await supabase.rpc("photon_outbound_config");
    if (photonError) {
      return NextResponse.json({ error: photonError.message }, { status: 400 });
    }
    const photon = asRecord(photonCreds) ?? {};
    if (!photon.configured) {
      return NextResponse.json(
        { error: "Connect Photon under Settings → Photon before provisioning SIP trunks." },
        { status: 400 },
      );
    }

    try {
      const companyLabel =
        typeof currentRow.companyName === "string" && currentRow.companyName
          ? currentRow.companyName
          : "Office";
      const outbound = await ensurePhotonOutboundTrunk({
        name: `Truss ${companyLabel} Photon outbound`,
        officeLine,
        projectId: String(photon.projectId),
        projectSecret: String(photon.projectSecret),
        existingTrunkId: outboundTrunkId || undefined,
      });
      outboundTrunkId = outbound.sipTrunkId;

      const inbound = await ensurePhotonInboundTrunk({
        name: `Truss ${companyLabel} Photon inbound`,
        officeLine,
        existingTrunkId: inboundTrunkId || undefined,
      });
      inboundTrunkId = inbound.sipTrunkId;

      const rule = await ensureInboundDispatchRule({
        name: `Truss ${companyLabel} inbound rooms`,
        trunkId: inboundTrunkId,
        roomPrefix: `call_${String(profile.company_id).replace(/-/g, "")}_`,
        existingRuleId: dispatchRuleId || undefined,
      });
      dispatchRuleId = rule.sipDispatchRuleId;
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not provision LiveKit SIP trunks against Photon.",
        },
        { status: 400 },
      );
    }
  }

  const { data, error } = await supabase.rpc("calling_company_save", {
    p_enabled: body?.enabled !== false,
    p_office_line: officeLine || (typeof body?.officeLine === "string" ? body.officeLine : ""),
    p_livekit_outbound_trunk_id: outboundTrunkId,
    p_livekit_inbound_trunk_id: inboundTrunkId,
    p_livekit_dispatch_rule_id: dispatchRuleId,
  });
  if (error) {
    if (isMissingCalling(error)) {
      return NextResponse.json({ error: missingCallingMessage() }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const status = asRecord(data) ?? {};
  if (status.ok === false) {
    return NextResponse.json({ error: status.error || "Could not save calling settings." }, { status: 400 });
  }

  const webhookToken = typeof status.webhookToken === "string" ? status.webhookToken : "";
  return NextResponse.json({
    ok: true,
    ...callingHostStatus(),
    enabled: Boolean(status.enabled),
    configured: Boolean(status.configured),
    officeLine: status.officeLine ?? "",
    livekitOutboundTrunkId: status.livekitOutboundTrunkId ?? "",
    livekitInboundTrunkId: status.livekitInboundTrunkId ?? "",
    livekitDispatchRuleId: status.livekitDispatchRuleId ?? "",
    webhookUrl: callingWebhookUrl(requestOrigin(request), webhookToken),
    inboundSipUriHint: callingHostStatus().inboundSipUriHint,
  });
}
