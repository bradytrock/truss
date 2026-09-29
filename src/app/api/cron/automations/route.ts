import { NextResponse } from "next/server";
import { buildAutomationMerge, emptyAutomationMerge } from "@/lib/automations/merge";
import { executeAutomationActions } from "@/lib/automations/execute";
import { previewActionLine } from "@/lib/automations/queue";
import { amountForEstimate } from "@/lib/estimate-totals";
import { mapAutomation, mapEstimate, mapEstimateLine } from "@/lib/supabase/mappers";
import { createAnonClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import type { Automation } from "@/lib/automations";
import type { JobMarket } from "@/lib/types";

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

function previewFromActions(
  automation: Automation,
  merge: ReturnType<typeof emptyAutomationMerge>,
  estimateTotal: number | null,
) {
  return automation.actions
    .map((action) => previewActionLine(action, merge, estimateTotal))
    .filter(Boolean)
    .join("\n\n");
}

export async function GET(request: Request) {
  if (!cronAuthorized(request) && !(await staffAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAnonClient();
  let enqueued = 0;
  const { data: upcoming, error: upcomingError } = await supabase.rpc("automation_upcoming_event_matches");
  if (!upcomingError) {
    for (const raw of asList(upcoming)) {
      const row = asRecord(raw);
      const automationRaw = row ? asRecord(row.automation) : null;
      if (!row || !automationRaw) continue;
      const automation = mapAutomation(automationRaw as never);
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
      const preview = previewFromActions(automation, merge, null);
      const { error } = await supabase.rpc("automation_insert_run", {
        p_run: {
          company_id: String(row.company_id ?? ""),
          automation_id: automation.id,
          job_id: typeof row.job_id === "string" ? row.job_id : "",
          event_id: typeof row.event_id === "string" ? row.event_id : "",
          status: automation.requiresConfirmation ? "pending_confirmation" : "scheduled",
          scheduled_for: automation.requiresConfirmation ? "" : new Date().toISOString(),
          rendered_preview: preview,
        },
      });
      if (!error) enqueued += 1;
    }
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
    const companyId = String(row.company_id ?? "");
    const automationRaw = asRecord(row.automation);
    if (!runId || !companyId || !automationRaw) continue;
    const automation = mapAutomation(automationRaw as never);
    if (automation.requiresConfirmation) {
      await supabase.rpc("automation_mark_run", {
        p_id: runId,
        p_status: "pending_confirmation",
        p_preview: String(row.rendered_preview ?? ""),
      });
      waiting += 1;
      continue;
    }
    const jobId = typeof row.job_id === "string" ? row.job_id : "";
    const estimateTotal = await estimateTotalForRun(supabase, row);
    const staff = asList(row.staff).flatMap((item) => {
      const seat = asRecord(item);
      if (!seat || typeof seat.id !== "string") return [];
      return [{
        id: seat.id,
        phone: String(seat.phone ?? ""),
        email: String(seat.email ?? ""),
        name: String(seat.name ?? ""),
      }];
    });
    const merge = buildAutomationMerge({
      company: {
        name: String(row.company_name ?? "Your company"),
        phone: String(row.company_phone ?? ""),
      } as never,
      staff: { name: String(row.owner_name ?? ""), phone: String(row.owner_phone ?? "") },
      job: jobId
        ? ({
            id: jobId,
            name: String(row.job_name ?? ""),
            code: String(row.job_code ?? ""),
            city: String(row.job_city ?? ""),
            street: String(row.job_street ?? ""),
            state: String(row.job_state ?? ""),
            postalCode: String(row.job_postal ?? ""),
            contractValue: Number(row.contract_value ?? 0),
            location: "",
          } as never)
        : null,
      contact: {
        name: String(row.contact_name ?? ""),
        phone: String(row.contact_phone ?? ""),
        email: String(row.contact_email ?? ""),
      } as never,
      estimateTotal,
      reviewUrl: String(row.review_url ?? ""),
    });
    const result = await executeAutomationActions({
      automation,
      merge,
      estimateTotal,
      customerPhone: String(row.contact_phone ?? ""),
      customerEmail: String(row.contact_email ?? ""),
      ownerPhone: String(row.owner_phone ?? ""),
      ownerEmail: String(row.owner_email ?? ""),
      staffById: (id) => staff.find((seat) => seat.id === id),
      createTask: async (title) => {
        const { error: taskError } = await supabase.rpc("automation_add_task", {
          p_company_id: companyId,
          p_title: title,
          p_job_id: jobId || undefined,
          p_assignee: String(row.owner_name ?? ""),
        });
        if (taskError) throw new Error(taskError.message);
      },
      setJobValue: async (amount) => {
        if (!jobId) throw new Error("This automation needs a job.");
        const { error: applyError } = await supabase.rpc("automation_apply_job", {
          p_job_id: jobId,
          p_set_value: true,
          p_value: amount,
          p_stage: "",
          p_note: "",
        });
        if (applyError) throw new Error(applyError.message);
      },
      setJobStage: async (stage) => {
        if (!jobId) throw new Error("This automation needs a job.");
        const { error: applyError } = await supabase.rpc("automation_apply_job", {
          p_job_id: jobId,
          p_set_value: false,
          p_value: 0,
          p_stage: stage,
          p_note: "",
        });
        if (applyError) throw new Error(applyError.message);
        return true;
      },
      addNote: async (note) => {
        if (!jobId) throw new Error("This automation needs a job.");
        const { error: applyError } = await supabase.rpc("automation_apply_job", {
          p_job_id: jobId,
          p_set_value: false,
          p_value: 0,
          p_stage: "",
          p_note: note,
        });
        if (applyError) throw new Error(applyError.message);
      },
    });
    await supabase.rpc("automation_mark_run", {
      p_id: runId,
      p_status: result.ok ? "sent" : "failed",
      p_delivery: result.delivery,
      p_error: result.error,
    });
    if (result.ok) sent += 1;
    else failed += 1;
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

async function estimateTotalForRun(
  supabase: ReturnType<typeof createAnonClient>,
  row: Record<string, unknown>,
) {
  const estimateId = typeof row.estimate_id === "string" ? row.estimate_id : "";
  if (!estimateId) return null;
  const needsTotal = asList(asRecord(row.automation)?.actions).some((item) => {
    const action = asRecord(item);
    return action?.kind === "set_job_value" && action.valueMode !== "amount" && action.valueMode !== "zero";
  });
  if (!needsTotal) return null;
  const { data, error } = await supabase.rpc("automation_estimate_bundle", { p_estimate_id: estimateId });
  if (error || !data || typeof data !== "object") return null;
  const bundle = data as { estimate?: unknown; lines?: unknown; job_market?: string; opportunity_market?: string };
  if (!bundle.estimate || typeof bundle.estimate !== "object") return null;
  try {
    const estimate = mapEstimate(bundle.estimate as never);
    const lines = asList(bundle.lines).flatMap((line) => {
      if (!line || typeof line !== "object") return [];
      return [mapEstimateLine(line as never)];
    });
    const market = (bundle.job_market || bundle.opportunity_market || "residential") as JobMarket;
    return amountForEstimate(estimate, lines, market === "commercial" ? "commercial" : "residential");
  } catch {
    return null;
  }
}
