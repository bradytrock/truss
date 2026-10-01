import { runRemoteWorkflowSlice } from "@/lib/automations/remote-execute";
import { classifyAutomationReply, workflowOf } from "@/lib/automations/workflow";
import { mapAutomation } from "@/lib/supabase/mappers";
import { createAnonClient } from "@/lib/supabase/anon";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asList(value: unknown) {
  return Array.isArray(value) ? value : [];
}

/** After an inbound text, take the yes or no branch of a waiting workflow. */
export async function resolveAutomationReplies(input: { companyId: string; from: string; body: string }) {
  const branch = classifyAutomationReply(input.body);
  if (!branch || !input.companyId || !input.from.trim()) return { matched: false };
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("automation_waiting_replies", {
    p_company_id: input.companyId,
    p_phone: input.from,
  });
  if (error) return { matched: false, error: error.message };
  const row = asRecord(asList(data)[0]);
  const automationRaw = row ? asRecord(row.automation) : null;
  const runId = row ? String(row.id ?? "") : "";
  if (!row || !automationRaw || !runId) return { matched: false };
  const automation = mapAutomation(automationRaw as never);
  if (!workflowOf(automation.triggerConfig)) return { matched: false };
  const claimed = await supabase.rpc("automation_claim_wait", { p_id: runId });
  const claim = asRecord(claimed.data);
  if (claimed.error || claim?.ok !== true) return { matched: false };
  const outcome = await runRemoteWorkflowSlice({
    supabase,
    row,
    automation,
    cursor: { lane: branch, index: 0 },
    prefix: branch === "yes" ? "They said yes" : "They said no",
  });
  await supabase.rpc("automation_mark_run", {
    p_id: runId,
    p_status: outcome.status,
    p_delivery: outcome.delivery,
    p_error: outcome.error,
    ...(outcome.scheduledFor ? { p_scheduled: outcome.scheduledFor } : {}),
    ...(outcome.cursor != null ? { p_cursor: outcome.cursor } : {}),
  });
  return { matched: true, branch, ok: outcome.ok, status: outcome.status };
}
