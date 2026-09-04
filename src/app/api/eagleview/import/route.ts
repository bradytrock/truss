import { NextResponse } from "next/server";
import {
  eagleviewProductLabel,
  isEagleviewProductId,
  type EagleviewProductId,
} from "@/lib/eagleview";
import {
  extractPdfText,
  mergeEagleviewMeasurementOverrides,
  parseEagleviewReportText,
} from "@/lib/eagleview-parse";
import {
  attachEagleviewPdf,
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
export const maxDuration = 60;

function asOptionalNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;
  const num = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(num) ? num : null;
}

export async function POST(request: Request) {
  try {
    return await importReport(request);
  } catch (error) {
    console.error("[eagleview/import]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not import that EagleView report.",
      },
      { status: 500 },
    );
  }
}

async function importReport(request: Request) {
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) {
    return NextResponse.json({ error: authError || "Unauthorized." }, { status: 401 });
  }

  const form = await request.formData();
  const jobId = String(form.get("jobId") ?? "").trim();
  const file = form.get("file");
  const productRaw = String(form.get("product") ?? "").trim();
  const claimNumber = String(form.get("claimNumber") ?? "").trim();
  const estimateRaw = String(form.get("estimateId") ?? "").trim();
  const pitchOverride = String(form.get("pitchSummary") ?? "").trim();
  const squaresOverride = asOptionalNumber(form.get("totalSquares"));
  const wasteOverride = asOptionalNumber(form.get("wastePercent"));

  if (!jobId) {
    return NextResponse.json({ error: "Pick a job before importing a report." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "Choose an EagleView PDF to upload." }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "That PDF is over 15 MB." }, { status: 400 });
  }
  const mime = (file.type || "").toLowerCase();
  const name = file.name || "eagleview-report.pdf";
  if (mime && mime !== "application/pdf" && !name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Upload a PDF EagleView report." }, { status: 400 });
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

  const product: EagleviewProductId = isEagleviewProductId(productRaw)
    ? productRaw
    : "premium_residential";
  const estimateId = estimateRaw || null;
  const addressLine = [job.street, job.city, job.state, job.postal_code]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(", ");

  const pdf = Buffer.from(await file.arrayBuffer());
  let extractedText = "";
  let pageCount = 0;
  try {
    const extracted = await extractPdfText(pdf);
    extractedText = extracted.text;
    pageCount = extracted.totalPages;
  } catch (error) {
    console.error("[eagleview/import] pdf text", error);
    // Scanned PDFs still attach if the user typed squares.
    if (squaresOverride == null) {
      return NextResponse.json(
        {
          error:
            "Could not read text from that PDF. Enter total squares below and upload again, or try a digital (not scanned) EagleView PDF.",
          needsManualSquares: true,
        },
        { status: 422 },
      );
    }
  }

  const parsed = parseEagleviewReportText(extractedText);
  const measurements = mergeEagleviewMeasurementOverrides(parsed, {
    totalSquares: squaresOverride,
    wastePercent: wasteOverride,
    pitchSummary: pitchOverride,
  });

  if (measurements.totalSquares == null) {
    return NextResponse.json(
      {
        error:
          extractedText.length < 40
            ? "That PDF looks scanned or empty. Enter total squares (and optional waste %) and upload again."
            : "Could not find total squares in that report. Enter them below and upload again.",
        needsManualSquares: true,
        preview: extractedText.slice(0, 400),
        pageCount,
      },
      { status: 422 },
    );
  }

  const referenceId = `import-${job.code || job.id.slice(0, 8)}-${Date.now().toString(36)}`;
  const orderedBy = profile.full_name || "";
  const attached = await attachEagleviewPdf({
    supabase,
    companyId: profile.company_id,
    jobId: job.id,
    fileName: name.replace(/^.*[/\\]/, "").trim() || `EagleView ${job.code || "report"}.pdf`,
    pdf,
    createdBy: orderedBy,
    uploadedBy: profile.id,
  });
  if (!attached.ok) {
    return NextResponse.json({ error: attached.error }, { status: 400 });
  }

  const insertPayload = {
    company_id: profile.company_id,
    job_id: job.id,
    estimate_id: estimateId,
    reference_id: referenceId,
    eagleview_order_id: parsed.orderId || "",
    eagleview_report_id: parsed.reportId || "",
    product,
    status: "ready" as const,
    status_detail: "Imported from uploaded PDF.",
    address_line: addressLine,
    city: (job.city ?? "").trim(),
    state: (job.state ?? "").trim(),
    postal_code: (job.postal_code ?? "").trim(),
    claim_number: claimNumber,
    total_squares: measurements.totalSquares ?? null,
    waste_percent: measurements.wastePercent ?? null,
    pitch_summary: measurements.pitchSummary ?? "",
    measurements: measurementsJson(measurements),
    report_file_id: attached.file.id,
    report_url: attached.file.url,
    mocked: false,
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
      { error: insertError?.message || "Could not save the imported report." },
      { status: 400 },
    );
  }

  await supabase.from("activities").insert({
    company_id: profile.company_id,
    entity_type: "job",
    entity_id: job.id,
    type: "note",
    body: `Imported EagleView PDF (${eagleviewProductLabel(product)}): ${measurements.totalSquares} squares${
      measurements.wastePercent != null ? `, ${measurements.wastePercent}% waste` : ""
    }.`,
    author: orderedBy,
  });

  return NextResponse.json({
    ok: true,
    order: mapEagleviewOrder(orderRow),
    measurements,
    pageCount,
    parsedFromText: Boolean(extractedText),
  });
}
