import { NextResponse } from "next/server";
import { executeAutomationActions } from "@/lib/automations/execute";
import { mergeForJob } from "@/lib/automations/queue";
import { mapAutomation, mapAutomationRun, mapCompany } from "@/lib/supabase/mappers";
import { createClient } from "@/lib/supabase/server";
import { fetchCompanyBook } from "@/lib/supabase/load-book";

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
  const companyId = profile?.company_id;
  if (!companyId || companyId !== run.companyId) {
    return NextResponse.json({ error: "Wrong company." }, { status: 403 });
  }

  const { data: companyRow } = await supabase.from("companies").select("*").eq("id", companyId).maybeSingle();
  if (!companyRow) return NextResponse.json({ error: "Company missing." }, { status: 404 });
  const book = await fetchCompanyBook(supabase, companyId);
  const job = run.jobId ? book.state.jobs.find((item) => item.id === run.jobId) : undefined;
  const contact = job ? book.state.contacts.find((item) => item.id === job.primaryContactId) : undefined;
  const owner = job ? book.state.staff.find((item) => item.id === job.ownerStaffId) : undefined;
  const merge = mergeForJob({ book: book.state, company: mapCompany(companyRow), job });

  await supabase.from("automation_runs").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", run.id);

  const result = await executeAutomationActions({
    automation,
    merge,
    customerPhone: contact?.phone,
    customerEmail: contact?.email,
    ownerPhone: owner?.phone,
    ownerEmail: owner?.email,
    companyId,
    userId: user.id,
    staffById: (id) => book.state.staff.find((item) => item.id === id),
    createTask: async (title) => {
      await supabase.from("tasks").insert({
        company_id: companyId,
        title,
        due_at: new Date().toISOString(),
        related_type: job ? "job" : null,
        related_id: job?.id ?? null,
        assignee: owner?.name ?? "",
      });
    },
  });

  await supabase
    .from("automation_runs")
    .update({
      status: result.ok ? "sent" : "failed",
      delivery_status: result.delivery,
      error_text: result.error,
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id);
  if (result.ok) {
    await supabase
      .from("automations")
      .update({ last_fired_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", automation.id);
  }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, delivery: result.delivery });
}
