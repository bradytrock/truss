import { executeAutomationActions } from "@/lib/automations/execute";
import { buildAutomationMerge } from "@/lib/automations/merge";
import { planWorkflowSlice, settleWorkflow, workflowOf } from "@/lib/automations/workflow";
import type { Automation, AutomationAction, WorkflowCursor } from "@/lib/automations/types";
import { amountForEstimate } from "@/lib/estimate-totals";
import { mapEstimate, mapEstimateLine } from "@/lib/supabase/mappers";
import type { Database } from "@/lib/supabase/database.types";
import type { JobMarket } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient<Database>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export async function runRemoteWorkflowSlice(input: {
  supabase: Client;
  row: Record<string, unknown>;
  automation: Automation;
  cursor: WorkflowCursor | null;
  prefix?: string;
}) {
  const workflow = workflowOf(input.automation.triggerConfig);
  if (!workflow) {
    const result = await executeRemoteAutomation(input);
    return {
      status: result.ok ? ("sent" as const) : ("failed" as const),
      delivery: result.delivery,
      error: result.error,
      scheduledFor: null as string | null,
      cursor: null as string | null,
      ok: result.ok,
    };
  }
  const plan = planWorkflowSlice({
    workflow,
    openingActions: input.automation.actions,
    cursor: input.cursor,
  });
  const result = plan.actions.length
    ? await executeRemoteAutomation({ ...input, actions: plan.actions })
    : { ok: true, delivery: "", error: "" };
  return { ...settleWorkflow(plan, result, input.prefix ?? ""), ok: result.ok };
}

export async function executeRemoteAutomation(input: {
  supabase: Client;
  row: Record<string, unknown>;
  automation: Automation;
  actions?: AutomationAction[];
}) {
  const actions = input.actions ?? input.automation.actions;
  if (actions.length === 0) return { ok: true, delivery: "", error: "" };
  const automation = { ...input.automation, actions };
  const row = input.row;
  const companyId = String(row.company_id ?? "");
  const jobId = typeof row.job_id === "string" ? row.job_id : "";
  const estimateTotal = await estimateTotalForRemote(input.supabase, row, actions);
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
  return executeAutomationActions({
    automation,
    merge,
    estimateTotal,
    customerPhone: String(row.contact_phone ?? ""),
    customerEmail: String(row.contact_email ?? ""),
    ownerPhone: String(row.owner_phone ?? ""),
    ownerEmail: String(row.owner_email ?? ""),
    staffById: (id) => staff.find((seat) => seat.id === id),
    createTask: async (title) => {
      const { error } = await input.supabase.rpc("automation_add_task", {
        p_company_id: companyId,
        p_title: title,
        p_job_id: jobId || undefined,
        p_assignee: String(row.owner_name ?? ""),
      });
      if (error) throw new Error(error.message);
    },
    setJobValue: async (amount) => {
      if (!jobId) throw new Error("This automation needs a job.");
      const { error } = await input.supabase.rpc("automation_apply_job", {
        p_job_id: jobId,
        p_set_value: true,
        p_value: amount,
        p_stage: "",
        p_note: "",
      });
      if (error) throw new Error(error.message);
    },
    setJobStage: async (stage) => {
      if (!jobId) throw new Error("This automation needs a job.");
      const { error } = await input.supabase.rpc("automation_apply_job", {
        p_job_id: jobId,
        p_set_value: false,
        p_value: 0,
        p_stage: stage,
        p_note: "",
      });
      if (error) throw new Error(error.message);
      return true;
    },
    addNote: async (note) => {
      if (!jobId) throw new Error("This automation needs a job.");
      const { error } = await input.supabase.rpc("automation_apply_job", {
        p_job_id: jobId,
        p_set_value: false,
        p_value: 0,
        p_stage: "",
        p_note: note,
      });
      if (error) throw new Error(error.message);
    },
  });
}

async function estimateTotalForRemote(supabase: Client, row: Record<string, unknown>, actions: AutomationAction[]) {
  const estimateId = typeof row.estimate_id === "string" ? row.estimate_id : "";
  if (!estimateId) return null;
  const needsTotal = actions.some(
    (action) => action.kind === "set_job_value" && action.valueMode !== "amount" && action.valueMode !== "zero",
  );
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
