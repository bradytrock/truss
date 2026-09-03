import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";
import { isMissingEagleview } from "@/lib/supabase/schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStatusId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

async function ingest(params: {
  token: string;
  referenceId: string;
  reportId: string;
  orderId: string;
  statusId: number | null;
  statusDetail: string;
}) {
  const supabase = createClient<Database>(getSupabaseUrl(), getSupabaseKey());
  const { data, error } = await supabase.rpc("eagleview_ingest_webhook", {
    p_token: params.token,
    p_reference_id: params.referenceId,
    p_report_id: params.reportId,
    p_order_id: params.orderId,
    p_status_id: params.statusId,
    p_status_detail: params.statusDetail,
  });

  if (error) {
    if (isMissingEagleview(error)) {
      return NextResponse.json({ ok: true, skipped: true, reason: "run_eagleview_sql" });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  if (row?.ok === false) {
    const err = asString(row.error);
    if (err === "invalid_token" || err === "missing_token") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (err === "order_not_found") {
      return NextResponse.json({ ok: true, skipped: true, reason: "order_not_found" });
    }
    return NextResponse.json({ error: err || "Webhook failed." }, { status: 400 });
  }

  return NextResponse.json(data ?? { ok: true });
}

function paramsFromUrl(url: URL) {
  return {
    token:
      url.searchParams.get("token")?.trim() ||
      url.searchParams.get("WebhookToken")?.trim() ||
      "",
    referenceId:
      url.searchParams.get("RefId")?.trim() ||
      url.searchParams.get("ReferenceId")?.trim() ||
      url.searchParams.get("refId")?.trim() ||
      "",
    reportId:
      url.searchParams.get("ReportId")?.trim() ||
      url.searchParams.get("reportId")?.trim() ||
      "",
    orderId:
      url.searchParams.get("OrderId")?.trim() ||
      url.searchParams.get("orderId")?.trim() ||
      "",
    statusId: asStatusId(
      url.searchParams.get("StatusId") ?? url.searchParams.get("statusId"),
    ),
    statusDetail:
      url.searchParams.get("Status")?.trim() ||
      url.searchParams.get("Message")?.trim() ||
      "",
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = paramsFromUrl(url);
  if (!params.token && !params.referenceId && !params.reportId) {
    return NextResponse.json({ ok: true });
  }
  return ingest(params);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const fromUrl = paramsFromUrl(url);
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const headerToken = request.headers.get("x-webhook-token")?.trim() || "";
  return ingest({
    token: fromUrl.token || headerToken || asString(body.token) || asString(body.WebhookToken),
    referenceId:
      fromUrl.referenceId ||
      asString(body.RefId) ||
      asString(body.ReferenceId) ||
      asString(body.referenceId),
    reportId:
      fromUrl.reportId || asString(body.ReportId) || asString(body.reportId),
    orderId: fromUrl.orderId || asString(body.OrderId) || asString(body.orderId),
    statusId:
      fromUrl.statusId ??
      asStatusId(body.StatusId) ??
      asStatusId(body.statusId),
    statusDetail:
      fromUrl.statusDetail || asString(body.Status) || asString(body.Message) || asString(body.status),
  });
}
