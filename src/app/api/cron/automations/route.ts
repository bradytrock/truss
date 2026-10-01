import { NextResponse } from "next/server";
import { conditionsPass } from "@/lib/automations/evaluate";
import { emptyAutomationMerge } from "@/lib/automations/merge";
import { previewAutomationSteps } from "@/lib/automations/queue";
import { runRemoteWorkflowSlice } from "@/lib/automations/remote-execute";
import { parseWorkflowCursor } from "@/lib/automations/workflow";
import { mapAutomation } from "@/lib/supabase/mappers";
import { createAnonClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import type { Automation } from "@/lib/automations";
import type { Job, Opportunity } from "@/lib/types";
import { workColumnFor } from "@/lib/work-board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim() ?? "";
  if (header === `Bearer ${secret}`) return true;
  return new URL(request.url).searchParams.get("secret") === secret;
}

async function staffAuthorized() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function markSlice(
  supabase: ReturnType<typeof createAnonClient>,
  runId: string,
  outcome: {
    status: "sent" | "failed" | "scheduled" | "waiting_reply";
    delivery: string;
    error: string;
    scheduledFor: string | null;
    cursor: string | null;
  },
) {
  await supabase.rpc("automation_mark_run", {
    p_id: runId,
    p_status: outcome.status,
    p_delivery: outcome.delivery,
    p_error: outcome.error,
    ...(outcome.scheduledFor ? { p_scheduled: outcome.scheduledFor } : {}),
    ...(outcome.cursor != null ? { p_cursor: outcome.cursor } : {}),
  });
}

function inboundConditionsPass(automation: Automation, row: Record<string, unknown>) {
  if (automation.conditions.length === 0) return true;
  const status = String(row.job_status ?? "precon");
  const opportunityId = String(row.opportunity_id ?? "");
  const opportunityStage = String(row.opportunity_stage ?? "");
  const jobSource = typeof row.job_lead_source === "string" ? row.job_lead_source : "";
  const opportunitySource = typeof row.opportunity_lead_source === "string" ? row.opportunity_lead_source : "";
  const leadSource = jobSource || opportunitySource;
  const stage = workColumnFor(
    {
      status: status as Job["status"],
      opportunityId: opportunityId || null,
      deletedAt: null,
    },
    opportunityStage ? { stage: opportunityStage as Opportunity["stage"] } : null,
  );
  return conditionsPass(automation.conditions, {
    job: {
      status: status as Job["status"],
      city: String(row.job_city ?? ""),
      state: String(row.job_state ?? ""),
      projectType: String(row.job_project_type ?? ""),
      market: String(row.job_market ?? ""),
      leadSource,
      ownerStaffId: String(row.owner_staff_id ?? ""),
    } as never,
    opportunity: {
      leadSource: opportunitySource || leadSource,
      market: String(row.job_market ?? ""),
      stage: opportunityStage,
    } as never,
    contact: {
      name: String(row.contact_name ?? ""),
      email: String(row.contact_email ?? ""),
    } as never,
    customerName: String(row.contact_name ?? ""),
    owner: { id: String(row.owner_staff_id ?? "") },
    stage,
  });
}

async function enqueueMatchedRuns(
  supabase: ReturnType<typeof createAnonClient>,
  rows: unknown,
  checkConditions: boolean,
) {
  let enqueued = 0;
  for (const raw of asList(rows)) {
    const row = asRecord(raw);
    const automationRaw = row ? asRecord(row.automation) : null;
    if (!row || !automationRaw) continue;
    const automation = mapAutomation(automationRaw as never);
    if (checkConditions && !inboundConditionsPass(automation, row)) continue;
    const dueAt = typeof row.due_at === "string" && row.due_at ? row.due_at : new Date().toISOString();
    const merge = {
      ...emptyAutomationMerge(),
      companyName: String(row.company_name ?? ""),
      companyPhone: String(row.company_phone ?? ""),
      staffName: String(row.owner_name ?? ""),
      staffPhone: String(row.owner_phone ?? ""),
      jobName: String(row.job_name ?? row.event_title ?? ""),
      jobCode: String(row.job_code ?? ""),
      jobCity: String(row.job_city ?? ""),
      contactName: String(row.contact_name ?? ""),
      contactPhone: String(row.contact_phone ?? ""),
      contactEmail: String(row.contact_email ?? ""),
    };
    const preview = previewAutomationSteps(automation, merge, null);
    const { error } = await supabase.rpc("automation_insert_run", {
      p_run: {
        company_id: String(row.company_id ?? ""),
        automation_id: automation.id,
        job_id: typeof row.job_id === "string" ? row.job_id : "",
        event_id: typeof row.event_id === "string" ? row.event_id : "",
        status: automation.requiresConfirmation ? "pending_confirmation" : "scheduled",
        scheduled_for: automation.requiresConfirmation ? "" : dueAt,
        rendered_preview: preview,
      },
    });
    if (!error) enqueued += 1;
  }
  return enqueued;
}

export async function GET(request: Request) {
  if (!cronAuthorized(request) && !(await staffAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAnonClient();
  let enqueued = 0;
  const { data: upcoming, error: upcomingError } = await supabase.rpc("automation_upcoming_event_matches");
  if (!upcomingError) {
    enqueued += await enqueueMatchedRuns(supabase, upcoming, false);
  }
  const { data: inbound, error: inboundError } = await supabase.rpc("automation_inbound_matches");
  if (!inboundError) {
    enqueued += await enqueueMatchedRuns(supabase, inbound, true);
  }

  const { data, error } = await supabase.rpc("automation_due_runs");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = asList(data);
  let sent = 0;
  let failed = 0;
  let waiting = 0;

  for (const raw of rows) {
    const row = asRecord(raw);
    if (!row) continue;
    const runId = String(row.id ?? "");
    const automationRaw = asRecord(row.automation);
    if (!runId || !automationRaw) continue;
    const automation = mapAutomation(automationRaw as never);
    const runStatus = String(row.status ?? "");
    const cursor = parseWorkflowCursor(row.workflow_cursor);
    if (runStatus === "scheduled" && cursor) {
      const outcome = await runRemoteWorkflowSlice({ supabase, row, automation, cursor });
      await markSlice(supabase, runId, outcome);
      if (outcome.status === "sent") sent += 1;
      else if (outcome.status === "failed") failed += 1;
      else waiting += 1;
      continue;
    }
    if (runStatus === "waiting_reply") {
      const claimed = await supabase.rpc("automation_claim_wait", { p_id: runId });
      const claim = asRecord(claimed.data);
      if (claimed.error || claim?.ok !== true) continue;
      const outcome = await runRemoteWorkflowSlice({
        supabase,
        row,
        automation,
        cursor: { lane: "timeout", index: 0 },
        prefix: "No reply",
      });
      await markSlice(supabase, runId, outcome);
      if (outcome.status === "sent") sent += 1;
      else if (outcome.status === "failed") failed += 1;
      else waiting += 1;
      continue;
    }
    if (automation.requiresConfirmation) {
      await supabase.rpc("automation_mark_run", {
        p_id: runId,
        p_status: "pending_confirmation",
        p_preview: String(row.rendered_preview ?? ""),
      });
      waiting += 1;
      continue;
    }
    const outcome = await runRemoteWorkflowSlice({ supabase, row, automation, cursor: null });
    await markSlice(supabase, runId, outcome);
    if (outcome.status === "sent") sent += 1;
    else if (outcome.status === "failed") failed += 1;
    else waiting += 1;
  }

  return NextResponse.json({
    ok: true,
    enqueued,
    processed: rows.length,
    sent,
    failed,
    waiting,
  });
}

