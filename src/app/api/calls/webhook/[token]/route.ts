import { NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { handleInboundRoom } from "@/lib/calls/server";
import { liveKitEnv } from "@/lib/calls/livekit";
import { createAnonClient } from "@/lib/supabase/anon";
import { toE164 } from "@/lib/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function attribute(attrs: Record<string, string> | undefined, key: string) {
  if (!attrs) return "";
  return attrs[key] || attrs[`sip.${key}`] || "";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("calling_inbound_company", { p_token: token });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const company = asRecord(data);
  if (!company?.ok || typeof company.companyId !== "string") {
    return NextResponse.json({ error: "Unknown webhook." }, { status: 401 });
  }
  if (!company.enabled) {
    return NextResponse.json({ ok: true, ignored: true, reason: "Calling disabled." });
  }

  const env = liveKitEnv();
  const body = await request.text();
  let event: {
    event?: string;
    room?: { name?: string };
    participant?: {
      identity?: string;
      name?: string;
      attributes?: Record<string, string>;
      kind?: number | string;
    };
  };

  if (env) {
    try {
      const receiver = new WebhookReceiver(env.apiKey, env.apiSecret);
      const authHeader = request.headers.get("Authorization") || "";
      event = await receiver.receive(body, authHeader);
    } catch {
      // Fall back to JSON body when signature verification fails in local/dev.
      try {
        event = JSON.parse(body) as typeof event;
      } catch {
        return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
      }
    }
  } else {
    try {
      event = JSON.parse(body) as typeof event;
    } catch {
      return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
    }
  }

  const eventName = event.event || "";
  const roomName = event.room?.name || "";
  if (!roomName) return NextResponse.json({ ok: true, ignored: true });

  // Inbound SIP caller joined a dispatch room — start multi-ring.
  if (eventName === "participant_joined") {
    const identity = event.participant?.identity || "";
    const attrs = event.participant?.attributes || {};
    const isSip =
      identity.startsWith("sip_") ||
      Boolean(attribute(attrs, "callID") || attribute(attrs, "phoneNumber") || attrs["sip.callID"]);
    if (!isSip) return NextResponse.json({ ok: true, ignored: true });

    const fromNumber =
      toE164(attribute(attrs, "phoneNumber") || attribute(attrs, "trunkPhoneNumber") || event.participant?.name || "") ||
      attribute(attrs, "phoneNumber") ||
      "";
    const toNumber =
      toE164(typeof company.officeLine === "string" ? company.officeLine : "") ||
      toE164(attribute(attrs, "trunkPhoneNumber")) ||
      "";

    try {
      const result = await handleInboundRoom({
        companyId: company.companyId,
        roomName,
        fromNumber,
        toNumber,
        callerParticipantIdentity: identity,
        livekitSipCallId: attribute(attrs, "callID"),
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not route inbound call." },
        { status: 400 },
      );
    }
  }

  if (eventName === "room_finished" || eventName === "participant_left") {
    const { data: sessionData } = await supabase.rpc("calling_find_session_by_room", {
      p_room_name: roomName,
    });
    const session = asRecord(sessionData);
    if (session?.ok && typeof session.id === "string" && session.status === "active") {
      // Only end when the room finishes.
      if (eventName === "room_finished") {
        await supabase.rpc("calling_end_session", {
          p_session_id: session.id,
          p_status: "ended",
          p_disposition: "",
          p_duration_seconds: null,
        });
        await supabase.rpc("calling_log_activity", { p_session_id: session.id });
      }
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: true, event: eventName });
}
