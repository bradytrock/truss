import { executeAutomationActions } from "@/lib/automations/execute";
import { mergeForJob, plannedRunsForEvent, runsAfterStageChange } from "@/lib/automations/queue";
import type { AutomationEventKind, AutomationRun } from "@/lib/automations/types";
import { createAnonClient } from "@/lib/supabase/anon";
import { mapAutomation } from "@/lib/supabase/mappers";
import { fillJobRecord } from "@/lib/job-record";
import type { CompanySettings, Contact, CrmState, Opportunity, StaffMember } from "@/lib/types";
import { patchForWorkColumn, workColumnFor } from "@/lib/work-board";

/** Homeowner signing has no office session. Queue and run proposal automations from the share token. */
export async function dispatchShareAutomation(input: {
  token: string;
  kind: Extract<AutomationEventKind, "estimate_won" | "estimate_lost">;
  estimateTotal: number | null;
}) {
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("automation_share_context", { p_token: input.token });
  if (error || !data || typeof data !== "object") return;
  const context = data as ShareContext;
  if (!context.company_id || !Array.isArray(context.automations) || context.automations.length === 0) return;

  const company = {
    name: context.company_name || "Your company",
    phone: context.company_phone || "",
  } as CompanySettings;
  const job = context.job_id
    ? fillJobRecord({
        id: context.job_id,
        name: context.job_name || "",
        code: context.job_code || "",
        city: context.job_city || "",
        street: context.job_street || "",
        state: context.job_state || "",
        postalCode: context.job_postal || "",
        status: (context.job_status || "precon") as "precon",
        contractValue: Number(context.contract_value ?? 0),
        ownerStaffId: context.owner_staff_id || "",
        opportunityId: context.opportunity_id || null,
        primaryContactId: context.contact_id || null,
        clientId: null,
        superintendent: "",
        projectManager: "",
        startDate: "",
        substantialCompletion: null,
        location: "",
      })
    : null;
  const opportunity = context.opportunity_id
    ? ({
        id: context.opportunity_id,
        stage: context.opportunity_stage || "pursuing",
        value: Number(context.contract_value ?? 0),
      } as Opportunity)
    : undefined;
  const contact = context.contact_id
    ? ({
        id: context.contact_id,
        name: context.contact_name || "",
        phone: context.contact_phone || "",
        email: context.contact_email || "",
      } as Contact)
    : undefined;
  const staff = (context.staff ?? []).map(
    (seat) =>
      ({
        id: seat.id,
        name: seat.name || "",
        phone: seat.phone || "",
        email: seat.email || "",
      }) as StaffMember,
  );
  const automations = context.automations.flatMap((row) => {
    try {
      return [mapAutomation(row as never)];
    } catch {
      return [];
    }
  });
  const automationRuns = (context.runs ?? []).map(
    (run) =>
      ({
        id: run.id,
        automationId: run.automation_id,
        jobId: run.job_id,
        status: run.status,
        dryRun: Boolean(run.dry_run),
        companyId: context.company_id,
      }) as AutomationRun,
  );
  const book = {
    automations,
    automationRuns,
    jobs: job ? [job] : [],
    contacts: contact ? [contact] : [],
    staff,
    opportunities: opportunity ? [opportunity] : [],
    googleLocations: context.review_url
      ? [{ id: "review", isDefault: true, reviewUrl: context.review_url, name: "" }]
      : [],
    estimates: [],
    estimateLines: [],
  } as unknown as CrmState;

  const planned = plannedRunsForEvent({
    event: {
      kind: input.kind,
      jobId: job?.id,
      estimateId: context.estimate_id || undefined,
    },
    book,
    company,
  });
  await runPlanned(supabase, planned, book, company, input.estimateTotal, 0);
}

async function runPlanned(
  supabase: ReturnType<typeof createAnonClient>,
  planned: AutomationRun[],
  book: CrmState,
  company: CompanySettings,
  estimateTotal: number | null,
  depth: number,
) {
  for (const next of planned) {
    const { error } = await supabase.rpc("automation_insert_run", {
      p_run: {
        id: next.id,
        company_id: next.companyId,
        automation_id: next.automationId,
        job_id: next.jobId ?? "",
        estimate_id: next.estimateId ?? "",
        invoice_id: next.invoiceId ?? "",
        status: next.status,
        scheduled_for: next.scheduledFor ?? "",
        rendered_preview: next.renderedPreview,
        dry_run: false,
      },
    });
    if (error) continue;
    book = { ...book, automationRuns: [next, ...book.automationRuns] };
    if (next.status !== "confirmed") continue;
    const automation = book.automations.find((item) => item.id === next.automationId);
    const job = next.jobId ? book.jobs.find((item) => item.id === next.jobId) : undefined;
    if (!automation || !job) continue;
    const opportunity = job.opportunityId
      ? book.opportunities.find((item) => item.id === job.opportunityId)
      : undefined;
    const contact = book.contacts.find((item) => item.id === job.primaryContactId);
    const owner = book.staff.find((item) => item.id === job.ownerStaffId);
    let jobState = job;
    let opportunityState = opportunity;
    const executed = await executeAutomationActions({
      automation,
      merge: mergeForJob({ book, company, job, estimateTotal }),
      estimateTotal,
      customerPhone: contact?.phone,
      customerEmail: contact?.email,
      ownerPhone: owner?.phone,
      ownerEmail: owner?.email,
      staffById: (id) => book.staff.find((item) => item.id === id),
      createTask: async (title) => {
        const { error: taskError } = await supabase.rpc("automation_add_task", {
          p_company_id: next.companyId,
          p_title: title,
          p_job_id: job.id,
          p_assignee: owner?.name ?? "",
        });
        if (taskError) throw new Error(taskError.message);
      },
      setJobValue: async (amount) => {
        const { error: applyError } = await supabase.rpc("automation_apply_job", {
          p_job_id: job.id,
          p_set_value: true,
          p_value: amount,
          p_stage: "",
          p_note: "",
        });
        if (applyError) throw new Error(applyError.message);
        jobState = { ...jobState, contractValue: amount };
      },
      setJobStage: async (stage) => {
        if (workColumnFor(jobState, opportunityState) === stage) return false;
        const { error: applyError } = await supabase.rpc("automation_apply_job", {
          p_job_id: job.id,
          p_set_value: false,
          p_value: 0,
          p_stage: stage,
          p_note: "",
        });
        if (applyError) throw new Error(applyError.message);
        const patch = patchForWorkColumn(stage);
        jobState = { ...jobState, status: patch.status };
        if (opportunityState && patch.stage) opportunityState = { ...opportunityState, stage: patch.stage };
        return true;
      },
      addNote: async (note) => {
        const { error: applyError } = await supabase.rpc("automation_apply_job", {
          p_job_id: job.id,
          p_set_value: false,
          p_value: 0,
          p_stage: "",
          p_note: note,
        });
        if (applyError) throw new Error(applyError.message);
      },
    });
    await supabase.rpc("automation_mark_run", {
      p_id: next.id,
      p_status: executed.ok ? "sent" : "failed",
      p_delivery: executed.delivery,
      p_error: executed.error,
    });
    if (!executed.ok || !executed.stageChanged || depth >= 3) continue;
    book = {
      ...book,
      jobs: book.jobs.map((item) => (item.id === jobState.id ? jobState : item)),
      opportunities: book.opportunities.map((item) =>
        opportunityState && item.id === opportunityState.id ? opportunityState : item,
      ),
    };
    const follow = runsAfterStageChange({
      book,
      company,
      jobId: jobState.id,
      stage: executed.stageChanged,
    }).filter((run) => !(automation.oncePerJob && run.automationId === automation.id));
    await runPlanned(supabase, follow, book, company, estimateTotal, depth + 1);
  }
}

type ShareContext = {
  company_id?: string;
  estimate_id?: string;
  job_id?: string;
  opportunity_id?: string;
  contact_id?: string;
  owner_staff_id?: string;
  company_name?: string;
  company_phone?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  job_name?: string;
  job_code?: string;
  job_city?: string;
  job_street?: string;
  job_state?: string;
  job_postal?: string;
  job_status?: string;
  contract_value?: number;
  opportunity_stage?: string;
  review_url?: string;
  automations?: unknown[];
  staff?: { id: string; name?: string; phone?: string; email?: string }[];
  runs?: { id: string; automation_id: string; job_id: string | null; status: AutomationRun["status"]; dry_run?: boolean }[];
};
