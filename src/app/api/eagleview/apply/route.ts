import { NextResponse } from "next/server";
import { applySquaresToEstimateLines } from "@/lib/eagleview";
import { loadProfileCompany } from "@/lib/eagleview-server";
import { estimateLinePatch, mapEagleviewOrder, mapEstimateLine } from "@/lib/supabase/mappers";
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
        orderId?: string;
        estimateId?: string;
        includeWaste?: boolean;
      }
    | null;

  const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
  const estimateId = typeof body?.estimateId === "string" ? body.estimateId.trim() : "";
  if (!orderId) {
    return NextResponse.json({ error: "Pick an EagleView order." }, { status: 400 });
  }
  if (!estimateId) {
    return NextResponse.json({ error: "Pick an estimate to apply squares to." }, { status: 400 });
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
  if (order.status !== "ready") {
    return NextResponse.json(
      { error: "Wait until the EagleView report is ready before applying squares." },
      { status: 400 },
    );
  }
  if (order.totalSquares == null || !Number.isFinite(order.totalSquares)) {
    return NextResponse.json(
      { error: "This report does not have total squares yet. Pull the report first." },
      { status: 400 },
    );
  }

  const { data: estimate, error: estimateError } = await supabase
    .from("estimates")
    .select("id, job_id")
    .eq("id", estimateId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (estimateError || !estimate) {
    return NextResponse.json({ error: "That estimate was not found." }, { status: 404 });
  }
  if (estimate.job_id && estimate.job_id !== order.jobId) {
    return NextResponse.json(
      { error: "That estimate belongs to a different job." },
      { status: 400 },
    );
  }

  const { data: lineRows, error: linesError } = await supabase
    .from("estimate_lines")
    .select("*")
    .eq("estimate_id", estimateId)
    .eq("company_id", profile.company_id)
    .order("sort_order");

  if (linesError) {
    return NextResponse.json({ error: linesError.message }, { status: 400 });
  }

  const lines = (lineRows ?? []).map(mapEstimateLine);
  const includeWaste = body?.includeWaste !== false;
  const waste = includeWaste ? order.wastePercent : null;
  const applied = applySquaresToEstimateLines(lines, order.totalSquares, waste);

  if (applied.updated.length === 0) {
    return NextResponse.json(
      {
        error:
          "No estimate line looks like field coverage (unit SQ/square, or title with shingle/square/field/roofing). Add one, then try again.",
      },
      { status: 400 },
    );
  }

  for (const item of applied.updated) {
    const patch = estimateLinePatch({ quantity: item.quantity });
    const { error } = await supabase
      .from("estimate_lines")
      .update(patch)
      .eq("id", item.id)
      .eq("company_id", profile.company_id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const { data: updatedOrder, error: updateError } = await supabase
    .from("eagleview_orders")
    .update({
      applied_estimate_id: estimateId,
      applied_at: now,
      estimate_id: estimateId,
      updated_at: now,
    })
    .eq("id", orderId)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  await supabase.from("activities").insert({
    company_id: profile.company_id,
    entity_type: "job",
    entity_id: order.jobId,
    type: "note",
    body: `Applied EagleView squares (${applied.quantity}${includeWaste && order.wastePercent != null ? ` incl. ${order.wastePercent}% waste` : ""}) to the estimate.`,
    author: profile.full_name || "",
  });

  return NextResponse.json({
    ok: true,
    quantity: applied.quantity,
    updatedLineIds: applied.updated.map((item) => item.id),
    order: updatedOrder ? mapEagleviewOrder(updatedOrder) : order,
  });
}
