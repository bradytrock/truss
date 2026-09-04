import { NextResponse } from "next/server";
import {
  buildEagleviewReportPdf,
  eagleviewProductLabel,
  fetchEagleviewReport,
  measurementsFromEagleviewReport,
  mockEagleviewMeasurements,
} from "@/lib/eagleview";
import {
  attachEagleviewPdf,
  ensureEagleviewAccessToken,
  loadEagleviewConnection,
  loadProfileCompany,
  measurementsJson,
} from "@/lib/eagleview-server";
import { mapEagleviewOrder } from "@/lib/supabase/mappers";
import { createClient } from "@/lib/supabase/server";
import {
  isMissingEagleview,
  missingEagleviewMessage,
} from "@/lib/supabase/schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pull measurements (+ PDF) for a ready / in-progress order. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) {
    return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { orderId?: string } | null;
  const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
  if (!orderId) {
    return NextResponse.json({ error: "Pick an EagleView order." }, { status: 400 });
  }

  const { data: orderRow, error: orderError } = await supabase
    .from("eagleview_orders")
    .select("*")
    .eq("id", orderId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (orderError) {
    if (isMissingEagleview(orderError)) {
      return NextResponse.json({ error: missingEagleviewMessage() }, { status: 400 });
    }
    return NextResponse.json({ error: orderError.message }, { status: 400 });
  }
  if (!orderRow) {
    return NextResponse.json({ error: "That EagleView order was not found." }, { status: 404 });
  }

  const order = mapEagleviewOrder(orderRow);
  let measurements = order.measurements;
  let status = order.status;
  let statusDetail = order.statusDetail;

  if (order.mocked) {
    if (!measurements.totalSquares) {
      measurements = mockEagleviewMeasurements(order.addressLine || order.id);
    }
    status = "ready";
    statusDetail = statusDetail || "Mock report ready.";
  } else {
    if (!order.eagleviewReportId) {
      return NextResponse.json(
        { error: "This order does not have an EagleView report id yet." },
        { status: 400 },
      );
    }
    const { row } = await loadEagleviewConnection(supabase, profile.company_id);
    const token = await ensureEagleviewAccessToken(supabase, profile.company_id, row);
    if (!token.ok) {
      return NextResponse.json({ error: token.error }, { status: 502 });
    }
    const report = await fetchEagleviewReport({
      accessToken: token.accessToken,
      sandbox: token.creds.sandbox,
      reportId: order.eagleviewReportId,
    });
    if (!report.ok) {
      return NextResponse.json({ error: report.error }, { status: 502 });
    }
    measurements = measurementsFromEagleviewReport(report.report);
    status = "ready";
    statusDetail = "Report pulled from EagleView.";
  }

  let reportFileId = order.reportFileId;
  let reportUrl = order.reportUrl;

  if (!reportFileId) {
    const pdf = buildEagleviewReportPdf({
      company: "Truss",
      address: order.addressLine,
      product: eagleviewProductLabel(order.product),
      orderId: order.eagleviewOrderId || order.referenceId,
      measurements,
      orderedBy: order.orderedBy || profile.full_name,
    });
    const attached = await attachEagleviewPdf({
      supabase,
      companyId: profile.company_id,
      jobId: order.jobId,
      fileName: `EagleView ${order.referenceId || order.id}.pdf`,
      pdf,
      createdBy: profile.full_name || order.orderedBy || "",
      uploadedBy: profile.id,
    });
    if (attached.ok) {
      reportFileId = attached.file.id;
      reportUrl = attached.file.url;
    }
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("eagleview_orders")
    .update({
      status,
      status_detail: statusDetail,
      total_squares: measurements.totalSquares ?? null,
      waste_percent: measurements.wastePercent ?? null,
      pitch_summary: measurements.pitchSummary ?? "",
      measurements: measurementsJson(measurements),
      report_file_id: reportFileId,
      report_url: reportUrl,
      updated_at: now,
    })
    .eq("id", orderId)
    .select("*")
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message || "Could not update the order." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, order: mapEagleviewOrder(updated) });
}
