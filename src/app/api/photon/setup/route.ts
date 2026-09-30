import { NextResponse } from "next/server";
import { loadProfileCompany } from "@/lib/eagleview-server";
import { toE164 } from "@/lib/phone";
import {
  loadPhotonConnection,
  photonWebhookUrl,
  publicPhotonStatus,
  randomPhotonWebhookToken,
  registerSpectrumWebhook,
} from "@/lib/photon-account";
import { requestOrigin } from "@/lib/share-text";
import { createClient } from "@/lib/supabase/server";
import { isMissingPhoton, missingPhotonMessage } from "@/lib/supabase/schema-errors";
import type { SeatRole } from "@/lib/types";
import { canManageSettings } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function schemaResponse(error: { message?: string; code?: string } | null | undefined) {
  if (!isMissingPhoton(error)) return null;
  return NextResponse.json({ linked: false, sql: missingPhotonMessage() });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });

  const role = (profile.role as SeatRole | undefined) ?? "project_manager";
  if (!canManageSettings(role)) {
    return NextResponse.json({ error: "Only a company admin can view Photon settings." }, { status: 403 });
  }

  const { row, error } = await loadPhotonConnection(supabase, profile.company_id);
  const missing = schemaResponse(error);
  if (missing) return missing;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    ...publicPhotonStatus(row, requestOrigin(request)),
    sql: null,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });

  const role = (profile.role as SeatRole | undefined) ?? "project_manager";
  if (!canManageSettings(role)) {
    return NextResponse.json({ error: "Only a company admin can change Photon settings." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        projectId?: string;
        projectSecret?: string;
        fromNumber?: string;
        webhookSecret?: string;
        disconnect?: boolean;
        rotateWebhook?: boolean;
      }
    | null;

  const { row, error: loadError } = await loadPhotonConnection(supabase, profile.company_id);
  const missing = schemaResponse(loadError);
  if (missing) return NextResponse.json({ error: missingPhotonMessage() }, { status: 400 });
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 400 });

  if (body?.disconnect) {
    const { error } = await supabase.from("photon_connections").upsert(
      {
        company_id: profile.company_id,
        project_id: "",
        project_secret: "",
        from_number: "",
        webhook_id: "",
        webhook_secret: "",
        linked: false,
        linked_at: null,
        linked_by: "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );
    if (error) {
      if (isMissingPhoton(error)) return NextResponse.json({ error: missingPhotonMessage() }, { status: 400 });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, linked: false });
  }

  const projectId = (typeof body?.projectId === "string" ? body.projectId : row?.project_id || "").trim();
  const pastedSecret = typeof body?.projectSecret === "string" ? body.projectSecret.trim() : "";
  const projectSecret = pastedSecret || row?.project_secret.trim() || "";
  const fromNumber = toE164(typeof body?.fromNumber === "string" ? body.fromNumber : row?.from_number || "");
  const pastedWebhook = typeof body?.webhookSecret === "string" ? body.webhookSecret.trim() : "";
  if (!projectId || !projectSecret) {
    return NextResponse.json({ error: "Enter this company's Photon project id and project secret." }, { status: 400 });
  }
  if (!fromNumber) {
    return NextResponse.json({ error: "Enter the dedicated Photon line for this company." }, { status: 400 });
  }

  let webhookToken = row?.webhook_token.trim() || "";
  if (!webhookToken || body?.rotateWebhook) webhookToken = randomPhotonWebhookToken();
  const webhookUrl = photonWebhookUrl(requestOrigin(request), webhookToken);
  let webhookId = body?.rotateWebhook ? "" : row?.webhook_id.trim() || "";
  let webhookSecret = body?.rotateWebhook ? "" : row?.webhook_secret.trim() || "";
  let webhookError = "";
  if (pastedWebhook) webhookSecret = pastedWebhook;
  if (webhookUrl && (!webhookSecret || body?.rotateWebhook)) {
    const registered = await registerSpectrumWebhook({ projectId, projectSecret, webhookUrl });
    if (registered.ok) {
      webhookId = registered.id || webhookId;
      webhookSecret = registered.signingSecret;
    } else {
      webhookError = registered.error;
    }
  }
  if (!webhookSecret) {
    return NextResponse.json(
      {
        error:
          webhookError ||
          "Paste the webhook signing secret Photon shows when you register this company's inbound URL.",
      },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("photon_connections").upsert(
    {
      company_id: profile.company_id,
      project_id: projectId,
      project_secret: projectSecret,
      from_number: fromNumber,
      webhook_token: webhookToken,
      webhook_id: webhookId,
      webhook_secret: webhookSecret,
      linked: true,
      linked_at: row?.linked_at || now,
      linked_by: profile.full_name?.trim() || row?.linked_by || "",
      updated_at: now,
    },
    { onConflict: "company_id" },
  );
  if (error) {
    if (isMissingPhoton(error)) return NextResponse.json({ error: missingPhotonMessage() }, { status: 400 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    ...publicPhotonStatus(
      {
        company_id: profile.company_id,
        project_id: projectId,
        project_secret: projectSecret,
        from_number: fromNumber,
        webhook_token: webhookToken,
        webhook_id: webhookId,
        webhook_secret: webhookSecret,
        linked: true,
        linked_at: row?.linked_at || now,
        linked_by: profile.full_name?.trim() || "",
        updated_at: now,
        created_at: row?.created_at || now,
      },
      requestOrigin(request),
    ),
    webhookError: webhookError || null,
    sql: null,
  });
}
