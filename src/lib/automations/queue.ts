import { amountForEstimate } from "@/lib/estimate-totals";
import {
  applyAutomationMerge,
  buildAutomationMerge,
  type AutomationMergeContext,
} from "@/lib/automations/merge";
import { describeJobValue } from "@/lib/automations/job-effects";
import { formatDuration, formatWait, mainSteps, workflowOf } from "@/lib/automations/workflow";
import {
  automationIsDelayed,
  automationMatchesEvent,
  conditionsPass,
  scheduledForFromTrigger,
} from "@/lib/automations/evaluate";
import type { Automation, AutomationAction, AutomationEvent, AutomationRun, WorkflowStep } from "@/lib/automations/types";
import { documentOwnerStaff } from "@/lib/document-owner";
import { marketForEstimate } from "@/lib/market";
import type { CompanySettings, Contact, CrmState, Job } from "@/lib/types";
import { WORK_COLUMN_LABELS, patchForWorkColumn, workColumnFor, type WorkColumn } from "@/lib/work-board";

export function previewAutomation(input: {
  automation: Automation;
  book: CrmState;
  company: CompanySettings;
  job?: Job | null;
  invoiceId?: string | null;
  estimateId?: string | null;
}) {
  const estimateTotal = estimateTotalForContext(input.book, input.job, input.estimateId);
  const ctx = mergeForJob({
    book: input.book,
    company: input.company,
    job: input.job,
    estimateTotal,
  });
  return previewAutomationSteps(input.automation, ctx, estimateTotal);
}

export function previewAutomationSteps(
  automation: Pick<Automation, "actions" | "triggerConfig">,
  merge: AutomationMergeContext,
  estimateTotal: number | null,
) {
  const workflow = workflowOf(automation.triggerConfig);
  const lines = workflow
    ? previewSteps(mainSteps(workflow, automation.actions), merge, estimateTotal)
    : automation.actions.map((action) => previewActionLine(action, merge, estimateTotal));
  if (workflow?.reply) {
    lines.push(
      previewWorkflowBranch("If yes", workflow.reply.yes, merge, estimateTotal),
      previewWorkflowBranch("If no", workflow.reply.no, merge, estimateTotal),
      previewWorkflowBranch(
        `If no reply in ${formatDuration(workflow.reply.amount, workflow.reply.unit)}`,
        workflow.reply.timeout,
        merge,
        estimateTotal,
      ),
    );
  }
  return lines.filter(Boolean).join("\n\n");
}

function previewSteps(steps: WorkflowStep[], merge: AutomationMergeContext, estimateTotal: number | null) {
  return steps.map((step) =>
    step.kind === "wait" ? formatWait(step.amount, step.unit) : previewActionLine(step.action, merge, estimateTotal),
  );
}

function previewWorkflowBranch(
  label: string,
  steps: WorkflowStep[],
  merge: AutomationMergeContext,
  estimateTotal: number | null,
) {
  if (steps.length === 0) return `${label}: Do nothing`;
  return `${label}: ${previewSteps(steps, merge, estimateTotal).join(", ")}`;
}

export function previewActionLine(
  action: AutomationAction,
  merge: AutomationMergeContext,
  estimateTotal: number | null,
) {
  if (action.kind === "webhook") return `Webhook ${action.url || ""}`.trim();
  if (action.kind === "create_task") return applyAutomationMerge(action.title ?? "Task", merge);
  if (action.kind === "set_job_value") return describeJobValue(action, estimateTotal);
  if (action.kind === "set_job_stage") {
    const stage = action.stage ? WORK_COLUMN_LABELS[action.stage as WorkColumn] : "";
    return `Move the job to ${stage || "a stage"}`;
  }
  if (action.kind === "add_note") return applyAutomationMerge(action.body ?? "", merge);
  if (action.kind === "send_email") {
    return `${applyAutomationMerge(action.subject ?? "", merge)}\n${applyAutomationMerge(action.body ?? "", merge)}`.trim();
  }
  return applyAutomationMerge(action.body ?? "", merge);
}

export function estimateTotalForContext(book: CrmState, job?: Job | null, estimateId?: string | null) {
  const chosen = pickEstimate(book, job, estimateId);
  if (!chosen) return null;
  const market = marketForEstimate(chosen, book.jobs ?? [], book.opportunities ?? []);
  return amountForEstimate(chosen, book.estimateLines ?? [], market);
}

function pickEstimate(book: CrmState, job?: Job | null, estimateId?: string | null) {
  const estimates = book.estimates ?? [];
  if (estimateId) {
    const direct = estimates.find((estimate) => estimate.id === estimateId && !estimate.archivedAt);
    if (direct) return direct;
  }
  if (!job) return undefined;
  const related = estimates.filter(
    (estimate) =>
      !estimate.archivedAt &&
      (estimate.jobId === job.id || Boolean(job.opportunityId && estimate.opportunityId === job.opportunityId)),
  );
  const rank = (status: string) => (status === "accepted" ? 3 : status === "sent" || status === "viewed" ? 2 : 1);
  return [...related].sort((left, right) => {
    const score = rank(right.status) - rank(left.status);
    if (score !== 0) return score;
    return (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
  })[0];
}

export function plannedRunsForEvent(input: {
  event: AutomationEvent;
  book: CrmState;
  company: CompanySettings;
}): AutomationRun[] {
  const job = input.event.jobId ? input.book.jobs.find((item) => item.id === input.event.jobId) : undefined;
  const opportunity = job?.opportunityId
    ? input.book.opportunities.find((item) => item.id === job.opportunityId)
    : undefined;
  const contact = job ? input.book.contacts.find((item) => item.id === job.primaryContactId) : undefined;
  const owner = job
    ? documentOwnerStaff({ job, opportunity, staff: input.book.staff })
    : undefined;
  const stage = input.event.stage || (job ? workColumnFor(job, opportunity) : undefined);
  const now = input.event.at ? new Date(input.event.at) : new Date();

  return input.book.automations.flatMap((automation) => {
    if (!automationMatchesEvent(automation, input.event)) return [];
    if (
      !conditionsPass(automation.conditions, {
        job,
        opportunity,
        contact,
        customerName: contact?.name,
        owner,
        stage,
      })
    ) {
      return [];
    }
    if (automation.oncePerJob && input.event.jobId) {
      const already = input.book.automationRuns.some(
        (run) =>
          run.automationId === automation.id &&
          run.jobId === input.event.jobId &&
          !run.dryRun &&
          run.status !== "skipped" &&
          run.status !== "failed",
      );
      if (already) return [];
    }
    const delayed = automationIsDelayed(automation.triggerKind);
    const preview = previewAutomation({
      automation,
      book: input.book,
      company: input.company,
      job,
      invoiceId: input.event.invoiceId,
      estimateId: input.event.estimateId,
    });
    const status = delayed
      ? "scheduled"
      : automation.requiresConfirmation
        ? "pending_confirmation"
        : "confirmed";
    return [{
      id: crypto.randomUUID(),
      companyId: automation.companyId,
      automationId: automation.id,
      jobId: input.event.jobId ?? job?.id ?? null,
      invoiceId: input.event.invoiceId ?? null,
      estimateId: input.event.estimateId ?? null,
      eventId: input.event.eventId ?? null,
      status,
      scheduledFor: delayed
        ? scheduledForFromTrigger(automation.triggerKind, Number(automation.triggerConfig.days) || 1, now)
        : null,
      renderedPreview: preview,
      deliveryStatus: "",
      errorText: "",
      confirmedByStaffId: null,
      confirmedByName: "",
      decidedAt: null,
      dryRun: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    } satisfies AutomationRun];
  });
}

export function runsAfterStageChange(input: {
  book: CrmState;
  company: CompanySettings;
  jobId: string;
  stage: WorkColumn;
  at?: string;
}): AutomationRun[] {
  const job = input.book.jobs.find((item) => item.id === input.jobId);
  if (!job) return [];
  const next = patchForWorkColumn(input.stage);
  const book: CrmState = {
    ...input.book,
    jobs: input.book.jobs.map((item) =>
      item.id === input.jobId ? { ...item, status: next.status, deletedAt: null } : item,
    ),
    opportunities: input.book.opportunities.map((item) =>
      job.opportunityId && item.id === job.opportunityId && next.stage ? { ...item, stage: next.stage } : item,
    ),
  };
  return plannedRunsForEvent({
    event: { kind: "job_stage_changed", jobId: input.jobId, stage: input.stage, at: input.at },
    book,
    company: input.company,
  });
}

export function mergeForJob(input: {
  book: CrmState;
  company: CompanySettings;
  job?: Job | null;
  estimateTotal?: number | null;
}): AutomationMergeContext {
  const job = input.job ?? undefined;
  const opportunity = job?.opportunityId
    ? input.book.opportunities.find((item) => item.id === job.opportunityId)
    : undefined;
  const contact: Contact | undefined = job
    ? input.book.contacts.find((item) => item.id === job.primaryContactId)
    : undefined;
  const staff = job
    ? documentOwnerStaff({ job, opportunity, staff: input.book.staff })
    : undefined;
  return buildAutomationMerge({
    company: input.company,
    staff,
    job,
    contact,
    estimateTotal: input.estimateTotal,
    reviewUrl:
      input.book.googleLocations.find((location) => location.isDefault)?.reviewUrl ||
      input.book.googleLocations[0]?.reviewUrl ||
      "",
  });
}
