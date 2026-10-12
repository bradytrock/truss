"use client";

import { useState } from "react";
import Link from "next/link";
import { CommissionSheetView } from "@/components/commission-sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrm } from "@/lib/crm-store";
import {
  blankQbLine,
  blankSplitLine,
  buildCommissionSheet,
  CLOSEOUT_STATUS_LABELS,
  mergePostedBills,
  payoutRecipients,
  type CommissionCloseout,
} from "@/lib/commission-closeout";
import { expensesForJob, forecastedExpensesForJob, paymentsForJob } from "@/lib/job-financials";
import { jobRecordHref } from "@/lib/job-record";
import { formatMoney } from "@/lib/format";

export function CloseoutCountBadge() {
  const crm = useCrm();
  const waiting = (crm.commissionCloseouts ?? []).filter((item) => item.status === "submitted").length;
  if (!waiting) return null;
  return <span className="ml-1 text-muted-foreground">{waiting}</span>;
}

export function AccountingCloseouts({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const crm = useCrm();
  const rank = { submitted: 0, released: 1, returned: 2, payout: 3 };
  const rows = [...(crm.commissionCloseouts ?? [])].sort(
    (a, b) => rank[a.status] - rank[b.status] || b.updatedAt.localeCompare(a.updatedAt),
  );
  const selected = rows.find((item) => item.id === selectedId) ?? rows.find((item) => item.status === "submitted") ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No closeouts yet. A project manager submits one from the job’s financials.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((closeout) => {
              const job = crm.getJob(closeout.jobId);
              const active = selected?.id === closeout.id;
              return (
                <li key={closeout.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(closeout.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left ${active ? "border-foreground" : ""}`}
                  >
                    <span className="block text-sm font-medium">{job?.code || job?.name || "Job"}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {CLOSEOUT_STATUS_LABELS[closeout.status]}
                      {job?.projectManager ? ` · ${job.projectManager}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {selected ? <CloseoutReview key={selected.id} closeout={selected} /> : null}
    </div>
  );
}

function CloseoutReview({ closeout }: { closeout: CommissionCloseout }) {
  const crm = useCrm();
  const job = crm.getJob(closeout.jobId);
  const [qbLines, setQbLines] = useState(closeout.qbLines);
  const [splits, setSplits] = useState(closeout.splits);
  const [ack, setAck] = useState(closeout.varianceAck);
  const [note, setNote] = useState(closeout.accountingNote);
  const [returnNote, setReturnNote] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [busy, setBusy] = useState(false);
  const editing = closeout.status === "submitted";
  const recipients = job ? payoutRecipients(crm.staff, job.projectManager) : [];
  const recipient = recipientId || recipients.find((member) => member.name === job?.projectManager)?.id || recipients[0]?.id || "";

  const client = job?.clientId ? crm.clients.find((item) => item.id === job.clientId) : null;
  const contact = job?.primaryContactId ? crm.contacts.find((item) => item.id === job.primaryContactId) : null;
  const opportunity = job?.opportunityId ? crm.opportunities.find((item) => item.id === job.opportunityId) : null;
  const claim = job ? ((crm.jobInsurance ?? []).find((item) => item.jobId === job.id) ?? null) : null;
  const sheet = job
    ? buildCommissionSheet({
        job,
        client,
        contact,
        opportunity,
        claim,
        payments: paymentsForJob(job.id, crm.payments, crm.invoices),
        expenses: expensesForJob(job.id, crm.expenses),
        forecasts: forecastedExpensesForJob(job.id, crm.forecastedExpenses ?? []),
        qbLines: editing ? qbLines : closeout.qbLines,
        splits: editing ? splits : closeout.splits,
        closingDate: job.substantialCompletion ?? closeout.submittedAt,
      })
    : null;

  if (!job || !sheet) {
    return <p className="text-sm text-muted-foreground">This closeout’s job is no longer on the book.</p>;
  }

  const review = {
    qbLines,
    splits,
    varianceAck: ack,
    accountingNote: note,
    notes: closeout.notes,
  };

  async function save() {
    setBusy(true);
    try {
      await crm.saveCommissionCloseoutReview(closeout.id, review);
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    if (!recipient) return;
    setBusy(true);
    try {
      await crm.releaseCommissionCloseout(closeout.id, recipient, review);
    } finally {
      setBusy(false);
    }
  }

  async function sendBack() {
    setBusy(true);
    try {
      await crm.returnCommissionCloseout(closeout.id, returnNote);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{job.name}</p>
          <p className="text-xs text-muted-foreground">
            Check {formatMoney(sheet.splitTotals.check)} · {CLOSEOUT_STATUS_LABELS[closeout.status]}
          </p>
        </div>
        <Button nativeButton={false} size="sm" variant="outline" render={<Link href={jobRecordHref(job.id, { tab: "financials" })} />}>
          Open job
        </Button>
      </div>

      <CommissionSheetView
        sheet={sheet}
        closeout={{ ...closeout, accountingNote: editing ? "" : closeout.accountingNote }}
        editing={editing}
        qbLines={qbLines}
        varianceAck={ack}
        onVarianceAck={setAck}
        onSplit={(id, patch) =>
          setSplits((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)))
        }
        onAddSplit={() => setSplits((current) => [...current, blankSplitLine(crypto.randomUUID())])}
        onRemoveSplit={(id) => setSplits((current) => current.filter((line) => line.id !== id))}
        onQb={(id, patch) =>
          setQbLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)))
        }
        onAddQb={() => setQbLines((current) => [...current, blankQbLine(crypto.randomUUID())])}
        onRemoveQb={(id) => setQbLines((current) => current.filter((line) => line.id !== id))}
        onPullPosted={() => setQbLines((current) => mergePostedBills(current, expensesForJob(job.id, crm.expenses)))}
      />

      {editing ? (
        <div className="space-y-3 rounded-md border p-3">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Note on this review"
            aria-label="Accounting note"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => void save()}>
              Save review
            </Button>
            <Select
              value={recipient || undefined}
              onValueChange={(value) => {
                if (value) setRecipientId(value);
              }}
              items={recipients.map((member) => ({ value: member.id, label: member.name }))}
            >
              <SelectTrigger className="w-56" aria-label="Project manager for payout">
                <SelectValue placeholder="Project manager" />
              </SelectTrigger>
              <SelectContent>
                {recipients.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" disabled={busy || !recipient} onClick={() => void release()}>
              Release for payout
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Textarea
              value={returnNote}
              onChange={(event) => setReturnNote(event.target.value)}
              placeholder="What needs to change"
              aria-label="Reason for sending the closeout back"
              className="min-w-64 flex-1"
            />
            <Button type="button" variant="outline" disabled={busy} onClick={() => void sendBack()}>
              Send back
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {closeout.status === "released"
            ? `With ${closeout.releasedToName || "the project manager"} for commission payout.`
            : closeout.status === "payout"
              ? `Marked for payout${closeout.payoutMarkedByName ? ` by ${closeout.payoutMarkedByName}` : ""}.`
              : "Sent back to the project manager."}
        </p>
      )}
    </div>
  );
}
