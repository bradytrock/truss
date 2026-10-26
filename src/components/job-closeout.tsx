"use client";

import { useMemo, useState } from "react";
import { CommissionSheetView } from "@/components/commission-sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import {
  buildCommissionSheet,
  canMarkCommissionPayout,
  canSubmitProjectCloseout,
  closeoutIsFinal,
  finalCloseoutLines,
} from "@/lib/commission-closeout";
import { isBusinessDevelopment } from "@/lib/bd";
import { expensesForJob, forecastedExpensesForJob, paymentsForJob } from "@/lib/job-financials";
import { isDeletedJob } from "@/lib/job-record";
import type { Job } from "@/lib/types";

export function JobCloseout({ job }: { job: Job }) {
  const crm = useCrm();
  const actor = crm.effectiveStaff;
  const closeout = (crm.commissionCloseouts ?? []).find((item) => item.jobId === job.id) ?? null;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const client = job.clientId ? crm.clients.find((item) => item.id === job.clientId) : null;
  const contact = job.primaryContactId ? crm.contacts.find((item) => item.id === job.primaryContactId) : null;
  const opportunity = job.opportunityId ? crm.opportunities.find((item) => item.id === job.opportunityId) : null;
  const claim = (crm.jobInsurance ?? []).find((item) => item.jobId === job.id) ?? null;
  const final = closeout ? closeoutIsFinal(closeout.status) : false;
  const releasedLines = finalCloseoutLines(closeout);
  const qbLines = releasedLines?.qbLines;
  const splits = releasedLines?.splits;
  const expenseAdjustments = releasedLines?.expenseAdjustments;

  const sheet = useMemo(() => {
    const built = buildCommissionSheet({
      job,
      client,
      contact,
      opportunity,
      claim,
      payments: paymentsForJob(job.id, crm.payments, crm.invoices),
      expenses: expensesForJob(job.id, crm.expenses),
      forecasts: forecastedExpensesForJob(job.id, crm.forecastedExpenses ?? []),
      qbLines,
      splits,
      expenseAdjustments,
      closingDate: job.substantialCompletion ?? closeout?.submittedAt ?? null,
    });
    return final ? { ...built, validationOnly: false } : built;
  }, [
    claim,
    client,
    closeout?.submittedAt,
    contact,
    crm.expenses,
    crm.forecastedExpenses,
    crm.invoices,
    crm.payments,
    expenseAdjustments,
    final,
    job,
    opportunity,
    qbLines,
    splits,
  ]);

  const canSubmit =
    !isDeletedJob(job) &&
    Boolean(actor) &&
    canSubmitProjectCloseout({
      role: actor?.role,
      title: actor?.title,
      viewerName: actor?.name ?? "",
      viewerStaffId: actor?.id,
      projectManager: job.projectManager,
      ownerStaffId: job.ownerStaffId,
    }) &&
    (!closeout || closeout.status === "returned");
  const canPayout =
    actor && closeout
      ? canMarkCommissionPayout({
          closeout,
          viewerStaffId: actor.id,
          viewerName: actor.name,
          viewerRole: actor.role,
        })
      : false;

  async function submit() {
    setBusy(true);
    try {
      await crm.submitCommissionCloseout(job.id, note);
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  async function markPayout() {
    if (!closeout) return;
    setBusy(true);
    try {
      await crm.markCommissionPayout(closeout.id);
    } finally {
      setBusy(false);
    }
  }

  if (!closeout) return null;

  return (
    <section className="space-y-3 rounded-md border p-3">
      {canSubmit && closeout.status === "returned" ? (
        <div className="space-y-2">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Note for accounting"
            aria-label="Note for accounting"
          />
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            Send again for closeout
          </Button>
        </div>
      ) : null}
      <CommissionSheetView
        sheet={sheet}
        closeout={closeout}
        heading={final ? "Final closeout" : "Mock closeout"}
      />
      {closeout.status === "submitted" ? (
        <p className="text-sm text-muted-foreground">
          This is the mock closeout. It updates to the final closeout when accounting submits it.
        </p>
      ) : null}
      {closeout.status === "returned" ? (
        <p className="text-sm text-muted-foreground">
          Accounting sent this back. The sheet stays a mock until they submit the final closeout.
        </p>
      ) : null}
      {closeout?.status === "released" ? (
        <p className="text-sm text-muted-foreground">
          Ready for Review
          {closeout.releasedToName
            ? ` — ${closeout.releasedToName} reviews this ${
                isBusinessDevelopment(actor?.role) ? "on the job" : "on Commissions"
              }.`
            : "."}
        </p>
      ) : null}
      {canPayout ? (
        <Button type="button" disabled={busy} onClick={() => void markPayout()}>
          Mark for commission payout
        </Button>
      ) : null}
      {closeout?.status === "payout" ? (
        <p className="text-sm">
          Marked for commission payout
          {closeout.payoutMarkedByName ? ` by ${closeout.payoutMarkedByName}` : ""}.
        </p>
      ) : null}
    </section>
  );
}
