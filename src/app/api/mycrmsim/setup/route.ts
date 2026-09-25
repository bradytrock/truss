import { NextResponse } from "next/server";
import { loadProfileCompany } from "@/lib/eagleview-server";
import {
  MYCRMSIM_CHANNEL_LABELS,
  MYCRMSIM_CHANNELS,
  normalizeMycrmsimChannel,
} from "@/lib/mycrmsim";
import { mycrmsimHostChannel, mycrmsimHostLocation, randomWebhookToken } from "@/lib/mycrmsim-server";
import { requestOrigin } from "@/lib/share-text";
import { createClient } from "@/lib/supabase/server";
import { isMissingMycrmsim, missingMycrmsimMessage } from "@/lib/supabase/schema-errors";
import { canManageSettings } from "@/lib/visibility";
import type { SeatRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function webhookUrl(request: Request, token: string) {
  const origin = requestOrigin(request);
  if (!token) return `${origin}/api/messages/inbound`;
  return `${origin}/api/messages/inbound?token=${encodeURIComponent(token)}`;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) {
    return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });
  }
  const role = (profile.role as SeatRole | undefined) ?? "project_manager";
  if (!canManageSettings(role)) {
    return NextResponse.json({ error: "Only a company admin can view myCRMSIM settings." }, { status: 403 });
  }

  const hostLocation = mycrmsimHostLocation();
  const { data, error } = await supabase
    .from("mycrmsim_connections")
    .select("*")
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (error) {
    if (isMissingMycrmsim(error)) {
      return NextResponse.json({
        configured: Boolean(hostLocation),
        linked: false,
        locationId: "",
        channel: mycrmsimHostChannel(),
        webhookToken: "",
        webhookUrl: webhookUrl(request, ""),
        hostConfigured: Boolean(hostLocation),
        channels: MYCRMSIM_CHANNELS.map((id) => ({ id, label: MYCRMSIM_CHANNEL_LABELS[id] })),
        sql: missingMycrmsimMessage(),
      });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const token = data?.webhook_token ?? "";
  const locationId = data?.location_id?.trim() || "";
  const linked = Boolean(data?.linked && locationId);
  return NextResponse.json({
    configured: linked || Boolean(hostLocation),
    linked,
    linkedAt: data?.linked_at ?? null,
    locationId,
    channel: normalizeMycrmsimChannel(data?.channel || mycrmsimHostChannel()),
    webhookToken: token,
    webhookUrl: webhookUrl(request, token),
    hostConfigured: Boolean(hostLocation),
    channels: MYCRMSIM_CHANNELS.map((id) => ({ id, label: MYCRMSIM_CHANNEL_LABELS[id] })),
    sql: null,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) {
    return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });
  }

  const role = (profile.role as SeatRole | undefined) ?? "project_manager";
  if (!canManageSettings(role)) {
    return NextResponse.json(
      { error: "Only a company admin can connect myCRMSIM." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        locationId?: string;
        channel?: string;
        disconnect?: boolean;
        rotateWebhook?: boolean;
      }
    | null;

  const { data: existing, error: loadError } = await supabase
    .from("mycrmsim_connections")
    .select("*")
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (loadError && isMissingMycrmsim(loadError)) {
    return NextResponse.json({ error: missingMycrmsimMessage() }, { status: 400 });
  }
  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 400 });
  }

  if (body?.disconnect) {
    const { error } = await supabase.from("mycrmsim_connections").upsert(
      {
        company_id: profile.company_id,
        location_id: "",
        channel: normalizeMycrmsimChannel(existing?.channel),
        webhook_token: existing?.webhook_token || randomWebhookToken(),
        linked: false,
        linked_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );
    if (error) {
      if (isMissingMycrmsim(error)) {
        return NextResponse.json({ error: missingMycrmsimMessage() }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, linked: false });
  }

  const locationId = (body?.locationId ?? existing?.location_id ?? "").trim();
  if (!locationId) {
    return NextResponse.json(
      { error: "Paste the Location ID from the myCRMSIM workspace." },
      { status: 400 },
    );
  }

  const channel = normalizeMycrmsimChannel(body?.channel || existing?.channel);
  const token =
    body?.rotateWebhook || !existing?.webhook_token
      ? randomWebhookToken()
      : existing.webhook_token;

  const { error } = await supabase.from("mycrmsim_connections").upsert(
    {
      company_id: profile.company_id,
      location_id: locationId,
      channel,
      webhook_token: token,
      linked: true,
      linked_at: existing?.linked ? existing.linked_at ?? new Date().toISOString() : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );

  if (error) {
    if (isMissingMycrmsim(error)) {
      return NextResponse.json({ error: missingMycrmsimMessage() }, { status: 400 });
    }
    const message = error.message.includes("mycrmsim_location")
      ? "That Location ID is already connected to another company."
      : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    linked: true,
    webhookUrl: webhookUrl(request, token),
    webhookToken: token,
  });
}
