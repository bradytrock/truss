import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/share-text";
import { qbwcFile } from "@/lib/qbwc/soap";
import { DEFAULT_QB_ITEM } from "@/lib/qbwc/work";
import { createClient } from "@/lib/supabase/server";
import {
  isMissingQbwc,
  isMissingQbwcPgcrypto,
  missingQbwcMessage,
  missingQbwcPgcryptoMessage,
} from "@/lib/supabase/schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to set up the Web Connector." }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("qbwc_connectors")
    .select("username, owner_id, file_id, default_item_name, enabled, last_connected_at, last_error")
    .maybeSingle();
  if (error) {
    if (isMissingQbwc(error)) {
      return NextResponse.json({ configured: false, sql: missingQbwcMessage() }, { status: 200 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({
      configured: false,
      appUrl: `${requestOrigin(request)}/api/qbwc`,
      itemName: DEFAULT_QB_ITEM,
    });
  }
  return NextResponse.json({
    configured: true,
    username: data.username,
    ownerId: data.owner_id,
    fileId: data.file_id,
    itemName: data.default_item_name,
    enabled: data.enabled,
    lastConnectedAt: data.last_connected_at,
    lastError: data.last_error,
    appUrl: `${requestOrigin(request)}/api/qbwc`,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to set up the Web Connector." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as
    | { password?: string; itemName?: string; appUrl?: string }
    | null;
  const password = typeof body?.password === "string" ? body.password : "";
  const itemName = typeof body?.itemName === "string" ? body.itemName : DEFAULT_QB_ITEM;
  const { data, error } = await supabase.rpc("qbwc_upsert_connector", {
    p_password: password,
    p_item_name: itemName,
  });
  if (error) {
    if (isMissingQbwcPgcrypto(error)) {
      return NextResponse.json({ error: missingQbwcPgcryptoMessage() }, { status: 400 });
    }
    if (isMissingQbwc(error)) {
      return NextResponse.json({ error: missingQbwcMessage() }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const row = asRecord(data);
  if (!row) {
    return NextResponse.json({ error: "Could not save the connector." }, { status: 400 });
  }
  const origin = requestOrigin(request);
  const appUrl =
    typeof body?.appUrl === "string" && /^https?:\/\//i.test(body.appUrl)
      ? body.appUrl.replace(/\/+$/, "")
      : `${origin}/api/qbwc`;
  const username = String(row.username ?? "");
  const qwc = qbwcFile({
    appUrl,
    userName: username,
    ownerId: String(row.ownerId ?? ""),
    fileId: String(row.fileId ?? ""),
    supportUrl: origin,
  });
  return NextResponse.json({
    username,
    ownerId: row.ownerId,
    fileId: row.fileId,
    itemName: row.itemName,
    enabled: row.enabled,
    appUrl,
    qwc,
    passwordSet: Boolean(password),
  });
}
