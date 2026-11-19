"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { CommitInput, CommitTextarea } from "@/components/commit-input";
import { InvoiceDocument } from "@/components/invoice-document";
import { InvoiceFilesPanel } from "@/components/invoice-files";
import { InvoiceLinesEditor } from "@/components/invoice-lines-editor";
import { EmptyState } from "@/components/page-chrome";
import { MentionComposer, ReviewCommentThread } from "@/components/qb-review-comments";
import { EstimateSummaryCard, ReadyToSendCard, type ReadinessItem } from "@/components/estimate-summary-rail";
import { QbStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrm } from "@/lib/crm-store";
import { formatDate, formatMoney } from "@/lib/format";
import { costCenterLabel } from "@/lib/job-record";
import { invoiceBalance, invoiceTotal, paidOnInvoice } from "@/lib/money";
import { invoicePushBlocked, workFromBook } from "@/lib/qbwc/work";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";

const CARD = "rounded-[12px] border bg-card";
const HINT = "mt-1.5 text-xs text-muted-foreground";

function describeSaved(savedAt: number, now: number) {
  const seconds = (now - savedAt) / 1000;
  if (seconds < 60) return "Saved just now";
  return `Saved ${Math.floor(seconds / 60)} min ago`;
}

function useSavedLabel(signature: string) {
  const previous = useRef(signature);
  const savedAt = useRef<number | null>(null);
  const [label, setLabel] = useState("All changes saved");
  useEffect(() => {
    if (previous.current === signature) return;
    previous.current = signature;
    const stamp = Date.now();
    savedAt.current = stamp;
    const id = window.setTimeout(() => setLabel(describeSaved(stamp, Date.now())), 0);
    return () => window.clearTimeout(id);
  }, [signature]);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (savedAt.current != null) setLabel(describeSaved(savedAt.current, Date.now()));
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return label;
}

export function InvoiceJobEditor({
  job,
  invoiceId,
  locked,
  waiting,
  note,
  pending,
  onBack,
  onNote,
  onComment,
  onResubmit,
}: {
  job: Job;
  invoiceId: string;
  locked: boolean;
  waiting: boolean;
  note: string;
  pending: "comment" | "resubmit" | null;
  onBack: () => void;
  onNote: (value: string) => void;
  onComment: () => void;
  onResubmit: () => void;
}) {
  const crm = useCrm();
  const [tab, setTab] = useState<"write" | "preview">("write");
  const invoice = crm.invoices.find((item) => item.id === invoiceId);
  const lines = crm.invoiceLines
    .filter((line) => line.invoiceId === invoiceId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const payments = crm.payments.filter((payment) => payment.invoiceId === invoiceId);
  const signature = invoice
    ? [
        invoice.name,
        invoice.issuedAt,
        invoice.dueAt ?? "",
        invoice.notes,
        invoice.terms,
        invoice.jobId ?? "",
        ...lines.map((line) => `${line.id}:${line.description}:${line.quantity}:${line.unit}:${line.unitCost}:${line.sortOrder}`),
      ].join("|")
    : invoiceId;
  const savedLabel = useSavedLabel(signature);

  if (!invoice) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center p-6">
        <EmptyState
          title="Invoice not on this job"
          description="It may have been removed. Go back to the job files."
          action={
            <Button type="button" variant="outline" onClick={onBack}>
              Back to job files
            </Button>
          }
        />
      </div>
    );
  }

  const record = invoice;
  const customer = crm.customerName(record);
  const total = invoiceTotal(record.id, lines);
  const paid = paidOnInvoice(record.id, payments);
  const balance = invoiceBalance(record.id, lines, payments);
  const linkedJob = record.jobId ? crm.getJob(record.jobId) : undefined;
  const { work } = workFromBook({
    invoice: record,
    job: linkedJob,
    lines,
    contacts: crm.contacts,
    clients: crm.clients,
    opportunities: crm.opportunities,
  });
  const jobs = jobChoices(crm);
  if (record.jobId && !jobs.some((row) => row.value === record.jobId)) {
    jobs.unshift({ value: record.jobId, label: linkedJob?.name || job.name });
  }
  const qbJob = linkedJob?.code || linkedJob?.name || work.jobCode || "Job";
  const qbWhere = `${customer}:${qbJob}`;
  const unpriced = lines.filter((line) => line.quantity * line.unitCost === 0).length;
  const blocked = invoicePushBlocked({ invoice: record, job: linkedJob, lines });
  const readiness: ReadinessItem[] = [
    linkedJob
      ? { label: "On a job", state: "ok", note: `· ${linkedJob.code || linkedJob.name}` }
      : { label: "On a job", state: "warn", note: "— assign one" },
    lines.length === 0
      ? { label: "Line items priced", state: "todo", note: "— add items" }
      : unpriced > 0
        ? { label: "Line items priced", state: "warn", note: `— ${unpriced} at $0.00` }
        : { label: "Line items priced", state: "ok" },
    blocked
      ? { label: "Ready for QuickBooks", state: "warn", note: "— fix the items above" }
      : { label: "Ready for QuickBooks", state: "ok", note: `· ${work.itemName}` },
  ];

  const summary = (className?: string) => (
    <EstimateSummaryCard
      className={className}
      eyebrow="Balance"
      countLabel={`${lines.length} item${lines.length === 1 ? "" : "s"}`}
      total={formatMoney(balance)}
      dueLine={record.dueAt ? `Due ${formatDate(record.dueAt)}` : "Due on receipt"}
      rows={[
        { label: "Invoice total", value: formatMoney(total) },
        { label: "Paid", value: formatMoney(paid), muted: paid === 0 },
      ]}
      footnote={`QuickBooks posts this on ${qbWhere} as ${work.itemName}.`}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 space-y-3 border-b px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" aria-hidden />
          Job files
        </button>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium tracking-wide text-muted-foreground">{record.number}</span>
              <QbStatusBadge status={record.qbStatus} />
              <span className="text-muted-foreground">{savedLabel}</span>
            </div>
            {locked ? (
              <h1 className="font-heading mt-1 text-[1.85rem] leading-[1.1] font-medium text-balance">{record.name}</h1>
            ) : (
              <CommitInput
                aria-label="Invoice name"
                className="font-heading mt-1 h-auto border-0 bg-transparent px-0 text-[1.85rem] leading-[1.1] font-medium shadow-none focus-visible:ring-0"
                value={record.name}
                onCommit={(value) => {
                  const name = value.trim();
                  if (name && name !== record.name) void crm.updateInvoice(record.id, { name });
                }}
              />
            )}
            <p className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground [&>span+span]:before:mr-2 [&>span+span]:before:content-['·']">
              <span>{customer}</span>
              {job.code ? <span>{job.code}</span> : <span>{job.name}</span>}
              <span>{record.dueAt ? `Due ${formatDate(record.dueAt)}` : "Due on receipt"}</span>
            </p>
            {waiting ? (
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Accounting asked for a change. Fix the invoice, leave a note, and send it back.
              </p>
            ) : null}
          </div>
          <div className="inline-flex w-fit rounded-md border bg-muted/40 p-0.5" role="tablist" aria-label="Invoice view">
            {(
              [
                ["write", "Write"],
                ["preview", "Customer preview"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "rounded-[5px] px-3 py-1 text-sm transition-colors",
                  tab === key ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-5">
          <div className="min-w-0 space-y-6">
            {summary("lg:hidden")}
            {tab === "write" ? (
              <>
                <InvoiceLinesEditor invoiceId={record.id} editable={!locked} />
                <div className="space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-2 pt-2">
                    <h2 className="font-heading text-xl font-medium">Invoice details</h2>
                    <p className="text-xs text-muted-foreground">Dates, the job, and notes print on the invoice</p>
                  </div>
                  <section className={cn(CARD, "p-4 sm:p-5")}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="invoice-issued">Issued</Label>
                        <CommitInput
                          id="invoice-issued"
                          type="date"
                          className="mt-1.5"
                          disabled={locked}
                          value={record.issuedAt.slice(0, 10)}
                          onCommit={(value) => {
                            if (value && value !== record.issuedAt.slice(0, 10)) {
                              void crm.updateInvoice(record.id, { issuedAt: value });
                            }
                          }}
                        />
                      </div>
                      <div>
                        <Label htmlFor="invoice-due">Due</Label>
                        <CommitInput
                          id="invoice-due"
                          type="date"
                          className="mt-1.5"
                          disabled={locked}
                          value={record.dueAt?.slice(0, 10) ?? ""}
                          onCommit={(value) => void crm.updateInvoice(record.id, { dueAt: value || null })}
                        />
                      </div>
                    </div>
                    <div className="mt-4">
                      <Label htmlFor="invoice-job">Job</Label>
                      <Select
                        value={record.jobId || "none"}
                        disabled={locked}
                        onValueChange={(value) =>
                          void crm.updateInvoice(record.id, { jobId: value === "none" ? null : String(value) })
                        }
                        items={[{ value: "none", label: "No job" }, ...jobs]}
                      >
                        <SelectTrigger id="invoice-job" className="mt-1.5 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No job</SelectItem>
                          {jobs.map((row) => (
                            <SelectItem key={row.value} value={row.value}>
                              {row.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className={HINT}>
                        QuickBooks will add this on <span className="font-mono">{qbWhere}</span> with item {work.itemName}.
                        Change the job or the lines if that is wrong.
                      </p>
                    </div>
                  </section>
                  <div className="grid gap-4 md:grid-cols-2">
                    <section className={cn(CARD, "p-4 sm:p-5")}>
                      <h3 className="text-sm font-semibold">Notes</h3>
                      <CommitTextarea
                        rows={5}
                        className="mt-2.5"
                        value={record.notes}
                        disabled={locked}
                        placeholder="Allowance details, exclusions, or anything that belongs after the total"
                        onCommit={(value) => {
                          if (value !== record.notes) void crm.updateInvoice(record.id, { notes: value });
                        }}
                      />
                      <p className={HINT}>Prints after the total on the invoice, the client link, and the PDF</p>
                    </section>
                    <section className={cn(CARD, "p-4 sm:p-5")}>
                      <h3 className="text-sm font-semibold">Attachments</h3>
                      <div className="mt-2.5">
                        <InvoiceFilesPanel invoiceId={record.id} disabled={locked} />
                      </div>
                    </section>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-[12px] bg-muted/40 p-3 sm:p-5">
                <InvoiceDocument
                  invoice={record}
                  lines={lines}
                  payments={payments}
                  customer={customer}
                  company={crm.company}
                  status={record.status}
                  onTermsChange={locked ? undefined : (terms) => void crm.updateInvoice(record.id, { terms })}
                />
              </div>
            )}
          </div>

          <aside className="mt-6 space-y-3 lg:sticky lg:top-0 lg:mt-0 lg:max-h-full lg:overflow-y-auto">
            {summary("hidden lg:block")}
            <ReadyToSendCard title="QuickBooks" items={readiness} />
            <section className={cn(CARD, "p-4")}>
              <ReviewCommentThread kind="invoice" recordId={record.id} />
              {locked ? (
                <p className="mt-3 text-sm text-muted-foreground">Already in QuickBooks.</p>
              ) : (
                <>
                  <div className="mt-3">
                    <MentionComposer
                      value={note}
                      onChange={onNote}
                      placeholder={
                        waiting
                          ? "What did you change? Type @ to tag accounting."
                          : "Leave a comment. Type @ to tag someone."
                      }
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {waiting ? (
                      <Button type="button" disabled={pending !== null} onClick={onResubmit}>
                        Send back to accounting
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" disabled={pending !== null || !note.trim()} onClick={onComment}>
                      Comment
                    </Button>
                  </div>
                </>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function jobChoices(crm: ReturnType<typeof useCrm>) {
  return [...crm.jobs]
    .filter((row) => !row.deletedAt)
    .sort((a, b) => costCenterLabel(a, crm.opportunities).localeCompare(costCenterLabel(b, crm.opportunities)))
    .map((row) => ({
      value: row.id,
      label: costCenterLabel(row, crm.opportunities),
    }));
}
