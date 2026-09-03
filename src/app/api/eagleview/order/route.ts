import { NextResponse } from "next/server";
import {
  buildEagleviewReportPdf,
  eagleviewProductLabel,
  eagleviewProductNumericId,
  isEagleviewProductId,
  mockEagleviewMeasurements,
  placeEagleviewOrder,
  type EagleviewProductId,
} from "@/lib/eagleview";
import {
  attachEagleviewPdf,
  ensureEagleviewAccessToken,
  loadEagleviewConnection,
  loadProfileCompany,
  measurementsJson,
  resolveEagleviewCredentials,
} from "@/lib/eagleview-server";
import { mapEagleviewOrder } from "@/lib/supabase/mappers";
import { createClient } from "@/lib/supabase/server";
import {
  isMissingEagleview,
  missingEagleviewMessage,
} from "@/lib/supabase/schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) {
    return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        jobId?: string;
        estimateId?: string | null;
        product?: string;
        claimNumber?: string;
      }
    | null;

  const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : "";
  if (!jobId) {
    return NextResponse.json({ error: "Pick a job before ordering EagleView." }, { status: 400 });
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, company_id, street, city, state, postal_code, name, code")
    .eq("id", jobId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (jobError || !job) {
    return NextResponse.json({ error: "That job was not found." }, { status: 404 });
  }

  const street = (job.street ?? "").trim();
  const city = (job.city ?? "").trim();
  const state = (job.state ?? "").trim();
  const postalCode = (job.postal_code ?? "").trim();
  if (!street || !city || !state || !postalCode) {
    return NextResponse.json(
      { error: "Add the full property address on the job before ordering EagleView." },
      { status: 400 },
    );
  }

  const { row, error: connError } = await loadEagleviewConnection(supabase, profile.company_id);
  if (connError && isMissingEagleview(connError)) {
    return NextResponse.json({ error: missingEagleviewMessage() }, { status: 400 });
  }

  const creds = resolveEagleviewCredentials(row);
  const product: EagleviewProductId =
    typeof body?.product === "string" && isEagleviewProductId(body.product)
      ? body.product
      : creds.defaultProduct;
  const claimNumber = typeof body?.claimNumber === "string" ? body.claimNumber.trim() : "";
  const estimateId =
    typeof body?.estimateId === "string" && body.estimateId.trim() ? body.estimateId.trim() : null;
  const referenceId = `truss-${job.code || job.id.slice(0, 8)}-${Date.now().toString(36)}`;
  const orderedBy = profile.full_name || "";
  const addressLine = [street, city, state, postalCode].filter(Boolean).join(", ");

  let eagleviewOrderId = "";
  let eagleviewReportId = "";
  let status: "queued" | "in_progress" | "ready" | "failed" = "queued";
  let statusDetail = "";
  let mocked = false;
  let measurements = mockEagleviewMeasurements(addressLine);

  if (!creds.live) {
    mocked = true;
    status = "ready";
    statusDetail = "Mock report — connect EagleView in Settings for live orders.";
    eagleviewOrderId = `mock-${referenceId}`;
    eagleviewReportId = `mock-report-${referenceId}`;
  } else {
    const token = await ensureEagleviewAccessToken(supabase, profile.company_id, row);
    if (!token.ok) {
      return NextResponse.json({ error: token.error }, { status: 502 });
    }
    const placed = await placeEagleviewOrder({
      accessToken: token.accessToken,
      sandbox: token.creds.sandbox,
      productId: eagleviewProductNumericId(product),
      referenceId,
      street,
      city,
      state,
      postalCode,
      claimNumber,
    });
    if (!placed.ok) {
      return NextResponse.json({ error: placed.error }, { status: 502 });
    }
    eagleviewOrderId = placed.orderId;
    eagleviewReportId = placed.reportId;
    status = "in_progress";
    statusDetail = "Submitted to EagleView.";
    measurements = {};
  }

  const insertPayload = {
    company_id: profile.company_id,
    job_id: job.id,
    estimate_id: estimateId,
    reference_id: referenceId,
    eagleview_order_id: eagleviewOrderId,
    eagleview_report_id: eagleviewReportId,
    product,
    status,
    status_detail: statusDetail,
    address_line: addressLine,
    city,
    state,
    postal_code: postalCode,
    claim_number: claimNumber,
    total_squares: measurements.totalSquares ?? null,
    waste_percent: measurements.wastePercent ?? null,
    pitch_summary: measurements.pitchSummary ?? "",
    measurements: measurementsJson(measurements),
    mocked,
    ordered_by: orderedBy,
  };

  const { data: orderRow, error: insertError } = await supabase
    .from("eagleview_orders")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertError || !orderRow) {
    if (insertError && isMissingEagleview(insertError)) {
      return NextResponse.json({ error: missingEagleviewMessage() }, { status: 400 });
    }
    return NextResponse.json(
      { error: insertError?.message || "Could not save the EagleView order." },
      { status: 400 },
    );
  }

  let reportFileId: string | null = null;
  let reportUrl = "";

  if (mocked && status === "ready") {
    const pdf = buildEagleviewReportPdf({
      company: "Truss",
      address: addressLine,
      product: eagleviewProductLabel(product),
      orderId: eagleviewOrderId,
      measurements,
      orderedBy,
    });
    const attached = await attachEagleviewPdf({
      supabase,
      companyId: profile.company_id,
      jobId: job.id,
      fileName: `EagleView ${job.code || "report"} ${new Date().toISOString().slice(0, 10)}.pdf`,
      pdf,
      createdBy: orderedBy,
    });
    if (attached.ok) {
      reportFileId = attached.file.id;
      reportUrl = attached.file.url;
      await supabase
        .from("eagleview_orders")
        .update({
          report_file_id: reportFileId,
          report_url: reportUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderRow.id);
    }
  }

  const order = mapEagleviewOrder({
    ...orderRow,
    report_file_id: reportFileId ?? orderRow.report_file_id,
    report_url: reportUrl || orderRow.report_url,
  });

  await supabase.from("activities").insert({
    company_id: profile.company_id,
    entity_type: "job",
    entity_id: job.id,
    type: "note",
    body: mocked
      ? `Ordered EagleView (mock): ${eagleviewProductLabel(product)} — ${measurements.totalSquares ?? "—"} squares.`
      : `Ordered EagleView: ${eagleviewProductLabel(product)} (${referenceId}).`,
    author: orderedBy,
  });

  return NextResponse.json({ ok: true, order, mocked });
}
