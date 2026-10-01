import { NextResponse } from "next/server";
import { executeAutomationActions } from "@/lib/automations/execute";
import { groupMessagePhones } from "@/lib/automations/group-text";
import { planWorkflowSlice, settleWorkflow, workflowOf } from "@/lib/automations/workflow";
import { estimateTotalForContext, mergeForJob, runsAfterStageChange } from "@/lib/automations/queue";
import { automationRunInsertPayload, mapAutomation, mapAutomationRun, mapCompany } from "@/lib/supabase/mappers";
import { createClient } from "@/lib/supabase/server";
import { fetchCompanyBook } from "@/lib/supabase/load-book";
import { patchForWorkColumn, workColumnFor } from "@/lib/work-board";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Could not read that request." }, { status: 400 });
  }
  const runId = typeof body.runId === "string" ? body.runId : "";
  if (!runId) return NextResponse.json({ error: "Missing run." }, { status: 400 });

  const { data: runRow, error: runError } = await supabase.from("automation_runs").select("*").eq("id", runId).maybeSingle();
  if (runError || !runRow) return NextResponse.json({ error: "That run is gone." }, { status: 404 });
  const run = mapAutomationRun(runRow);
  if (run.dryRun) {
    return NextResponse.json({ ok: true, delivery: "Dry run — nothing sent." });
  }
  if (run.status === "skipped") {
    return NextResponse.json({ ok: true, delivery: "Skipped." });
  }

  const { data: ruleRow, error: ruleError } = await supabase
    .from("automations")
    .select("*")
    .eq("id", run.automationId)
    .maybeSingle();
  if (ruleError || !ruleRow) return NextResponse.json({ error: "That automation is gone." }, { status: 404 });
  const automation = mapAutomation(ruleRow);
  if (!automation.enabled) {
    return NextResponse.json({ error: "That automation is paused." }, { status: 409 });
  }

  const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
  const profileCompanyId = profile?.company_id;
  if (!profileCompanyId || profileCompanyId !== run.companyId) {
    return NextResponse.json({ error: "Wrong company." }, { status: 403 });
  }
  const companyIdForRun: string = profileCompanyId;

  const { data: companyRow } = await supabase.from("companies").select("*").eq("id", companyIdForRun).maybeSingle();
  if (!companyRow) return NextResponse.json({ error: "Company missing." }, { status: 404 });
  const company = mapCompany(companyRow);

  async function perform(currentRunId: string, depth: number): Promise<{ ok: boolean; delivery: string; error: string; status: number }> {
    const loaded = currentRunId === run.id
      ? { run, automation }
      : await loadRun(currentRunId);
    if (!loaded) return { ok: false, error: "That run is gone.", delivery: "", status: 404 };
    if (!loaded.automation.enabled) return { ok: false, error: "That automation is paused.", delivery: "", status: 409 };

    const book = await fetchCompanyBook(supabase, companyIdForRun);
    const job = loaded.run.jobId ? book.state.jobs.find((item) => item.id === loaded.run.jobId) : undefined;
    let jobState = job;
    let opportunity = job?.opportunityId
      ? book.state.opportunities.find((item) => item.id === job.opportunityId)
      : undefined;
    const contact = job ? book.state.contacts.find((item) => item.id === job.primaryContactId) : undefined;
    const owner = job ? book.state.staff.find((item) => item.id === job.ownerStaffId) : undefined;
    const estimateTotal = estimateTotalForContext(book.state, job, loaded.run.estimateId);
    const merge = mergeForJob({ book: book.state, company, job, estimateTotal });

    await supabase
      .from("automation_runs")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("id", loaded.run.id);

    const workflow = workflowOf(loaded.automation.triggerConfig);
    const plan = workflow
      ? planWorkflowSlice({
          workflow,
          openingActions: loaded.automation.actions,
          cursor: loaded.run.workflowCursor ?? null,
        })
      : null;
    const sliceActions = plan ? plan.actions : loaded.automation.actions;
    const executed = sliceActions.length
      ? await executeAutomationActions({
      automation: { ...loaded.automation, actions: sliceActions },
      merge,
      emailTemplates: company.emailTemplates,
      customerPhone: contact?.phone,
      customerEmail: contact?.email,
      ownerPhone: owner?.phone,
      ownerEmail: owner?.email,
      groupPhones: groupMessagePhones(job, book.state.contacts),
      estimateTotal,
      staffById: (id) => book.state.staff.find((item) => item.id === id),
      createTask: async (title) => {
        const { error } = await supabase.from("tasks").insert({
          company_id: companyIdForRun,
          title,
          due_at: new Date().toISOString().slice(0, 10),
          related_type: job ? "job" : null,
          related_id: job?.id ?? null,
          assignee: owner?.name ?? "",
        });
        if (error) throw new Error(error.message);
      },
      setJobValue: async (amount) => {
        if (!jobState) throw new Error("This automation needs a job.");
        const { error } = await supabase.from("jobs").update({ contract_value: amount }).eq("id", jobState.id);
        if (error) throw new Error(error.message);
        jobState = { ...jobState, contractValue: amount };
        if (opportunity) {
          const { error: oppError } = await supabase.from("opportunities").update({ value: amount }).eq("id", opportunity.id);
          if (oppError) throw new Error(oppError.message);
          opportunity = { ...opportunity, value: amount };
        }
      },
      setJobStage: async (stage) => {
        if (!jobState) throw new Error("This automation needs a job.");
        if (workColumnFor(jobState, opportunity) === stage) return false;
        const next = patchForWorkColumn(stage);
        if (opportunity && next.stage && opportunity.stage !== next.stage) {
          const { error } = await supabase.from("opportunities").update({ stage: next.stage }).eq("id", opportunity.id);
          if (error) throw new Error(error.message);
          opportunity = { ...opportunity, stage: next.stage };
        }
        if (jobState.status !== next.status) {
          const { error } = await supabase.from("jobs").update({ status: next.status }).eq("id", jobState.id);
          if (error) throw new Error(error.message);
          jobState = { ...jobState, status: next.status };
        }
        return true;
      },
      addNote: async (body) => {
        if (!jobState) throw new Error("This automation needs a job.");
        const { error } = await supabase.from("activities").insert({
          company_id: companyIdForRun,
          entity_type: "job",
          entity_id: jobState.id,
          type: "note",
          body,
          author: "Automation",
        });
        if (error) throw new Error(error.message);
      },
    })
      : { ok: true as const, delivery: "", error: "", stageChanged: null };

    const settled = plan
      ? settleWorkflow(plan, executed)
      : {
          status: executed.ok ? ("sent" as const) : ("failed" as const),
          delivery: executed.delivery,
          error: executed.error,
          scheduledFor: loaded.run.scheduledFor,
          cursor: "",
        };
    await supabase
      .from("automation_runs")
      .update({
        status: settled.status,
        scheduled_for: settled.scheduledFor,
        workflow_cursor: settled.cursor ? JSON.parse(settled.cursor) : null,
        delivery_status: settled.delivery,
        error_text: settled.error,
        updated_at: new Date().toISOString(),
      })
      .eq("id", loaded.run.id);
    if (settled.status !== "failed") {
      await supabase
        .from("automations")
        .update({ last_fired_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", loaded.automation.id);
    }
    if (!executed.ok) return { ok: false, error: executed.error, delivery: "", status: 502 };

    if (executed.stageChanged && jobState && depth < 3) {
      const snapshot = await fetchCompanyBook(supabase, companyIdForRun);
      const follow = runsAfterStageChange({
        book: snapshot.state,
        company,
        jobId: jobState.id,
        stage: executed.stageChanged,
      });
      for (const next of follow) {
        if (next.automationId === loaded.automation.id && loaded.automation.oncePerJob) continue;
        const { error } = await supabase.from("automation_runs").insert(automationRunInsertPayload(next));
        if (error) continue;
        if (next.status === "confirmed") await perform(next.id, depth + 1);
      }
    }

    return { ok: true, delivery: executed.delivery, error: "", status: 200 };
  }

  async function loadRun(currentRunId: string) {
    const { data: row } = await supabase.from("automation_runs").select("*").eq("id", currentRunId).maybeSingle();
    if (!row) return null;
    const mapped = mapAutomationRun(row);
    const { data: rule } = await supabase.from("automations").select("*").eq("id", mapped.automationId).maybeSingle();
    if (!rule) return null;
    return { run: mapped, automation: mapAutomation(rule) };
  }

  const result = await perform(run.id, 0);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, delivery: result.delivery });
}
