import { NextResponse } from "next/server";
import {
  EAGLEVIEW_PRODUCTS,
  eagleviewHostCredentials,
  isEagleviewProductId,
} from "@/lib/eagleview";
import {
  loadEagleviewConnection,
  loadProfileCompany,
  randomWebhookToken,
  resolveEagleviewCredentials,
} from "@/lib/eagleview-server";
import { requestOrigin } from "@/lib/share-text";
import { createClient } from "@/lib/supabase/server";
import {
  isMissingEagleview,
  missingEagleviewMessage,
} from "@/lib/supabase/schema-errors";
import { canManageSettings } from "@/lib/visibility";
import type { SeatRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) {
    return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });
  }

  const host = eagleviewHostCredentials();
  const { connection, row, error } = await loadEagleviewConnection(supabase, profile.company_id);
  if (error) {
    if (isMissingEagleview(error)) {
      return NextResponse.json({
        configured: false,
        sql: missingEagleviewMessage(),
        hostConfigured: Boolean(host.clientId && host.clientSecret),
        products: EAGLEVIEW_PRODUCTS,
        webhookUrl: `${requestOrigin(request)}/api/eagleview/webhook`,
      });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const creds = resolveEagleviewCredentials(row);
  return NextResponse.json({
    configured: Boolean(connection?.linked || creds.live),
    linked: Boolean(connection?.linked),
    linkedAt: connection?.linkedAt ?? null,
    clientId: connection?.clientId ?? "",
    hasSecret: Boolean(connection?.hasSecret),
    sandbox: connection?.sandbox ?? host.sandbox,
    defaultProduct: connection?.defaultProduct ?? "premium_residential",
    webhookToken: connection?.webhookToken || "",
    webhookUrl: connection?.webhookToken
      ? `${requestOrigin(request)}/api/eagleview/webhook?token=${encodeURIComponent(connection.webhookToken)}`
      : `${requestOrigin(request)}/api/eagleview/webhook`,
    hostConfigured: Boolean(host.clientId && host.clientSecret),
    live: creds.live,
    products: EAGLEVIEW_PRODUCTS,
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
      { error: "Only a company admin can change EagleView settings." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        clientId?: string;
        clientSecret?: string;
        sandbox?: boolean;
        defaultProduct?: string;
        disconnect?: boolean;
        rotateWebhook?: boolean;
      }
    | null;

  if (body?.disconnect) {
    const { error } = await supabase.from("eagleview_connections").upsert(
      {
        company_id: profile.company_id,
        client_id: "",
        client_secret: "",
        linked: false,
        linked_at: null,
        access_token: "",
        token_expires_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );
    if (error) {
      if (isMissingEagleview(error)) {
        return NextResponse.json({ error: missingEagleviewMessage() }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, linked: false });
  }

  const { row, error: loadError } = await loadEagleviewConnection(supabase, profile.company_id);
  if (loadError && isMissingEagleview(loadError)) {
    return NextResponse.json({ error: missingEagleviewMessage() }, { status: 400 });
  }

  const clientId =
    typeof body?.clientId === "string" ? body.clientId.trim() : (row?.client_id ?? "");
  let clientSecret = row?.client_secret ?? "";
  if (typeof body?.clientSecret === "string" && body.clientSecret.trim()) {
    clientSecret = body.clientSecret.trim();
  }
  const sandbox = typeof body?.sandbox === "boolean" ? body.sandbox : (row?.sandbox ?? true);
  const defaultProduct =
    typeof body?.defaultProduct === "string" && isEagleviewProductId(body.defaultProduct)
      ? body.defaultProduct
      : row?.default_product && isEagleviewProductId(row.default_product)
        ? row.default_product
        : "premium_residential";

  let webhookToken = row?.webhook_token?.trim() || "";
  if (!webhookToken || body?.rotateWebhook) {
    webhookToken = randomWebhookToken();
  }

  const linked = Boolean(clientId && clientSecret);
  const { error } = await supabase.from("eagleview_connections").upsert(
    {
      company_id: profile.company_id,
      client_id: clientId,
      client_secret: clientSecret,
      sandbox,
      default_product: defaultProduct,
      webhook_token: webhookToken,
      linked,
      linked_at: linked ? row?.linked_at || new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );

  if (error) {
    if (isMissingEagleview(error)) {
      return NextResponse.json({ error: missingEagleviewMessage() }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    linked,
    webhookToken,
    webhookUrl: `${requestOrigin(request)}/api/eagleview/webhook?token=${encodeURIComponent(webhookToken)}`,
    defaultProduct,
    sandbox,
    hasSecret: Boolean(clientSecret),
    clientId,
  });
}
