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
} from "@/lib/commission-closeout";
import { expensesForJob, forecastedExpensesForJob, paymentsForJob } from "@/lib/job-financials";
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

  const sheet = useMemo(
    () =>
      buildCommissionSheet({
        job,
        client,
        contact,
        opportunity,
        claim,
        payments: paymentsForJob(job.id, crm.payments, crm.invoices),
        expenses: expensesForJob(job.id, crm.expenses),
        forecasts: forecastedExpensesForJob(job.id, crm.forecastedExpenses ?? []),
        qbLines: closeout?.qbLines,
        splits: closeout?.splits,
        expenseAdjustments: closeout?.expenseAdjustments,
        closingDate: job.substantialCompletion ?? closeout?.submittedAt ?? null,
      }),
    [
      claim,
      client,
      closeout?.qbLines,
      closeout?.splits,
      closeout?.expenseAdjustments,
      closeout?.submittedAt,
      contact,
      crm.expenses,
      crm.forecastedExpenses,
      crm.invoices,
      crm.payments,
      job,
      opportunity,
    ],
  );

  const canSubmit =
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

  return (
    <section className="space-y-3 rounded-md border p-3">
      {canSubmit ? (
        <div className="space-y-2">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Note for accounting"
            aria-label="Note for accounting"
          />
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            {closeout?.status === "returned" ? "Send again for closeout" : "Send for closeout"}
          </Button>
        </div>
      ) : null}
      <CommissionSheetView sheet={sheet} closeout={closeout} />
      {closeout?.status === "submitted" ? (
        <p className="text-sm text-muted-foreground">
          Accounting has this sheet. They compare QuickBooks with the expenses, then send it on for payout.
        </p>
      ) : null}
      {closeout?.status === "released" ? (
        <p className="text-sm text-muted-foreground">
          Ready for Review
          {closeout.releasedToName ? ` — ${closeout.releasedToName} reviews this on Commissions.` : "."}
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
