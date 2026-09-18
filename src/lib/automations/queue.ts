import {
  applyAutomationMerge,
  buildAutomationMerge,
  type AutomationMergeContext,
} from "@/lib/automations/merge";
import {
  automationIsDelayed,
  automationMatchesEvent,
  conditionsPass,
  scheduledForFromTrigger,
} from "@/lib/automations/evaluate";
import type { Automation, AutomationEvent, AutomationRun } from "@/lib/automations/types";
import { documentOwnerStaff } from "@/lib/document-owner";
import type { CompanySettings, Contact, CrmState, Job } from "@/lib/types";
import { workColumnFor } from "@/lib/work-board";

export function previewAutomation(input: {
  automation: Automation;
  book: CrmState;
  company: CompanySettings;
  job?: Job | null;
  invoiceId?: string | null;
  estimateId?: string | null;
}) {
  const ctx = mergeForJob({
    book: input.book,
    company: input.company,
    job: input.job,
  });
  const lines = input.automation.actions.map((action) => {
    if (action.kind === "webhook") return `Webhook ${action.url || ""}`.trim();
    if (action.kind === "create_task") return applyAutomationMerge(action.title ?? "Task", ctx);
    if (action.kind === "send_email") {
      return `${applyAutomationMerge(action.subject ?? "", ctx)}\n${applyAutomationMerge(action.body ?? "", ctx)}`.trim();
    }
    return applyAutomationMerge(action.body ?? "", ctx);
  });
  return lines.filter(Boolean).join("\n\n");
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
      eventId: null,
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

export function mergeForJob(input: {
  book: CrmState;
  company: CompanySettings;
  job?: Job | null;
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
    reviewUrl:
      input.book.googleLocations.find((location) => location.isDefault)?.reviewUrl ||
      input.book.googleLocations[0]?.reviewUrl ||
      "",
  });
}
