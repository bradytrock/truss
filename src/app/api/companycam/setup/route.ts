import { NextResponse } from "next/server";
import {
  connectionTokenHint,
  deleteCompanyCamWebhook,
  loadCompanyCamConnection,
  publicCompanyCamStatus,
  randomCompanyCamWebhookToken,
  registerCompanyCamWebhook,
  verifyCompanyCamToken,
} from "@/lib/companycam-server";
import { companyCamWebhookUrl, looksLikeCompanyCamToken } from "@/lib/companycam";
import { loadProfileCompany } from "@/lib/eagleview-server";
import { requestOrigin } from "@/lib/share-text";
import { createClient } from "@/lib/supabase/server";
import { isMissingCompanyCam, missingCompanyCamMessage } from "@/lib/supabase/schema-errors";
import type { SeatRole } from "@/lib/types";
import { canManageSettings } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function schemaResponse(error: { message?: string; code?: string } | null | undefined) {
  if (!isMissingCompanyCam(error)) return null;
  return NextResponse.json({ configured: false, sql: missingCompanyCamMessage() });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });

  const role = (profile.role as SeatRole | undefined) ?? "project_manager";
  if (!canManageSettings(role)) {
    return NextResponse.json({ error: "Only a company admin can view CompanyCam settings." }, { status: 403 });
  }

  const { row, error } = await loadCompanyCamConnection(supabase, profile.company_id);
  const missing = schemaResponse(error);
  if (missing) return missing;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    ...publicCompanyCamStatus(row, requestOrigin(request)),
    sql: null,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });

  const role = (profile.role as SeatRole | undefined) ?? "project_manager";
  if (!canManageSettings(role)) {
    return NextResponse.json({ error: "Only a company admin can change CompanyCam settings." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { accessToken?: string; disconnect?: boolean; rotateWebhook?: boolean }
    | null;

  const { row, error: loadError } = await loadCompanyCamConnection(supabase, profile.company_id);
  const missing = schemaResponse(loadError);
  if (missing) return NextResponse.json({ error: missingCompanyCamMessage() }, { status: 400 });
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 400 });

  if (body?.disconnect) {
    if (row?.access_token && row.webhook_id) {
      await deleteCompanyCamWebhook(row.access_token, row.webhook_id);
    }
    const { error } = await supabase.from("companycam_connections").upsert(
      {
        company_id: profile.company_id,
        access_token: "",
        token_hint: "",
        companycam_company_id: "",
        companycam_company_name: "",
        webhook_id: "",
        linked: false,
        linked_at: null,
        linked_by: "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );
    if (error) {
      if (isMissingCompanyCam(error)) {
        return NextResponse.json({ error: missingCompanyCamMessage() }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, linked: false });
  }

  const pasted = typeof body?.accessToken === "string" ? body.accessToken.trim() : "";
  const token = pasted || row?.access_token.trim() || "";
  if (pasted && !looksLikeCompanyCamToken(pasted)) {
    return NextResponse.json(
      { error: "Paste the CompanyCam Application Key or personal access token. It should be one long string with no spaces." },
      { status: 400 },
    );
  }
  if (!looksLikeCompanyCamToken(token)) {
    return NextResponse.json(
      { error: "Paste a CompanyCam access token from Integrations → Access Tokens." },
      { status: 400 },
    );
  }

  const verified = await verifyCompanyCamToken(token);
  if (!verified.ok || !verified.company) {
    return NextResponse.json({ error: verified.error || "CompanyCam rejected that token." }, { status: 400 });
  }

  let webhookToken = row?.webhook_token.trim() || "";
  if (!webhookToken || body?.rotateWebhook) webhookToken = randomCompanyCamWebhookToken();
  const webhookUrl = companyCamWebhookUrl(requestOrigin(request), webhookToken);
  const registered = webhookUrl
    ? await registerCompanyCamWebhook({
        token,
        webhookToken,
        webhookUrl,
        previousWebhookId: row?.webhook_id,
      })
    : { id: "", error: "Could not build the webhook URL for this host." };

  const now = new Date().toISOString();
  const { error } = await supabase.from("companycam_connections").upsert(
    {
      company_id: profile.company_id,
      access_token: token,
      token_hint: connectionTokenHint(token),
      companycam_company_id: verified.company.id,
      companycam_company_name: verified.company.name,
      webhook_id: registered.id,
      webhook_token: webhookToken,
      linked: true,
      linked_at: row?.linked_at || now,
      linked_by: profile.full_name?.trim() || row?.linked_by || "",
      updated_at: now,
    },
    { onConflict: "company_id" },
  );
  if (error) {
    if (isMissingCompanyCam(error)) {
      return NextResponse.json({ error: missingCompanyCamMessage() }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    ...publicCompanyCamStatus(
      {
        company_id: profile.company_id,
        access_token: token,
        token_hint: connectionTokenHint(token),
        companycam_company_id: verified.company.id,
        companycam_company_name: verified.company.name,
        webhook_id: registered.id,
        webhook_token: webhookToken,
        linked: true,
        linked_at: row?.linked_at || now,
        linked_by: profile.full_name?.trim() || "",
        updated_at: now,
        created_at: row?.created_at || now,
      },
      requestOrigin(request),
    ),
    webhookError: registered.error || null,
  });
}
