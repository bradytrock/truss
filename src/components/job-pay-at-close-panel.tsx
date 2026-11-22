"use client";

import { useState, type ReactNode } from "react";
import { Check, Download, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/currency-input";
import { PhoneInput } from "@/components/phone-input";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/page-chrome";
import { cn } from "@/lib/utils";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull, formatDate } from "@/lib/format";
import {
  LIEN_KIND_LABELS,
  LIEN_KINDS,
  LIEN_SOURCE_LABELS,
  LISTING_STATUS_LABELS,
  LISTING_STATUSES,
  PAY_AT_CLOSE_STATUS_LABELS,
  RECOMMENDATION_LABELS,
  buildPayAtCloseReport,
  decidePayAtClose,
  estimateMortgageBalance,
  newPayAtCloseRequest,
  payAtCloseAwaitingApproval,
  payAtCloseStatusChoices,
  type JobPayAtClose,
  type LienKind,
  type LienRecord,
  type ListingStatus,
  type PayAtCloseReport,
  type PayAtCloseStatus,
  type PropertyRecord,
  type Recommendation,
  type RiskSeverity,
} from "@/lib/pay-at-close";
import { downloadPayAtClosePdf } from "@/lib/pay-at-close-pdf";
import { canDecidePayAtClose, canRequestPayAtClose } from "@/lib/visibility";
import type { Job } from "@/lib/types";

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function JobPayAtClosePanel({ job, readOnly = false }: { job: Job; readOnly?: boolean }) {
  const crm = useCrm();
  const saved = (crm.jobPayAtClose ?? []).find((item) => item.jobId === job.id);
  return (
    <PayAtCloseEditor
      key={`${saved?.id ?? "new"}:${saved?.updatedAt ?? ""}`}
      job={job}
      saved={saved}
      readOnly={readOnly}
      onSave={crm.saveJobPayAtClose}
    />
  );
}

type ReviewResponse = {
  ok?: boolean;
  error?: string;
  property?: unknown;
  report?: PayAtCloseReport;
  provider?: string;
  live?: boolean;
  lookupError?: string | null;
  narrativeFromModel?: boolean;
};

function PayAtCloseEditor({
  job,
  saved,
  readOnly,
  onSave,
}: {
  job: Job;
  saved: JobPayAtClose | undefined;
  readOnly: boolean;
  onSave: (record: JobPayAtClose) => Promise<JobPayAtClose | null>;
}) {
  const crm = useCrm();
  const [draft, setDraft] = useState<JobPayAtClose | null>(saved ?? null);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const canDecide = canDecidePayAtClose(crm.effectiveStaff?.role);
  const canRequest = canRequestPayAtClose(crm.effectiveStaff?.role);
  const actor = crm.effectiveStaff ? { id: crm.effectiveStaff.id, name: crm.effectiveStaff.name } : null;
  const [decisionNote, setDecisionNote] = useState("");
  const [changingDecision, setChangingDecision] = useState(false);
  const homeowner = crm.getContact(job.primaryContactId)?.name ?? crm.customerName(job);

  async function decide(decision: "approved" | "declined") {
    if (!draft || readOnly || !canDecide || !actor) return;
    await persist(decidePayAtClose(draft, decision, actor, decisionNote));
    setDecisionNote("");
    setChangingDecision(false);
  }

  async function persist(next: JobPayAtClose) {
    if (readOnly) return;
    setSaving(true);
    setDraft(next);
    const result = await onSave(next);
    if (!result) setSaving(false);
  }

  function patch(partial: Partial<JobPayAtClose>) {
    setDraft((current) => (current ? { ...current, ...partial } : current));
  }

  /** Recompute the deterministic report locally when deal inputs change, keeping any model narrative. */
  function recompute(next: JobPayAtClose): JobPayAtClose {
    if (!next.property && !next.report) return next;
    const report = buildPayAtCloseReport({
      record: next,
      property: next.property,
      state: job.state,
      narrative: "",
    });
    return { ...next, report };
  }

  async function runReview(reuseProperty: boolean) {
    if (!draft || readOnly) return;
    setReviewing(true);
    try {
      const response = await fetch("/api/pay-at-close/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: { street: job.street, city: job.city, state: job.state, postalCode: job.postalCode },
          record: draft,
          reuseProperty,
          jobName: job.name,
          homeowner,
        }),
      });
      const body = (await response.json().catch(() => null)) as ReviewResponse | null;
      if (!response.ok || !body?.ok || !body.report) {
        toast.error(body?.error ?? "The property review did not run.");
        return;
      }
      if (body.lookupError) toast.message(body.lookupError);
      const property = (body.property ?? draft.property) as PropertyRecord | null;
      const next: JobPayAtClose = { ...draft, property, report: body.report };
      await persist(next);
      toast.success(
        body.live
          ? `Property review ran against ${body.provider}.`
          : "Property review ran with sample records. Set ATTOM_API_KEY on the host for live public records.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The property review did not run.");
    } finally {
      setReviewing(false);
    }
  }

  async function downloadPdf() {
    if (!draft?.report) return;
    setDownloading(true);
    try {
      await downloadPayAtClosePdf({ company: crm.company, job, record: draft, homeowner });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build the PDF.");
    } finally {
      setDownloading(false);
    }
  }

  if (!draft) {
    return (
      <EmptyState
        title="No pay-at-close request on this job yet"
        description="Ask to carry this repair to the homeowner's closing. The request pulls public property records, estimates equity after loans and liens, scores the risk, and waits for a company admin to approve it. You can also start one from New → Pay at Close Request."
        action={
          readOnly || !canRequest ? null : (
            <Button
              type="button"
              onClick={() =>
                void persist(
                  newPayAtCloseRequest({
                    jobId: job.id,
                    id: crypto.randomUUID(),
                    state: job.state,
                    contractValue: job.contractValue || 0,
                    requester: actor,
                  }),
                )
              }
            >
              Request pay at close
            </Button>
          )
        }
      />
    );
  }

  const report = draft.report;
  const waterfall = report?.waterfall ?? null;
  const property = draft.property;
  const statusOptions = payAtCloseStatusChoices(draft);
  const awaitingApproval = payAtCloseAwaitingApproval(draft);
  const decided = Boolean(draft.decidedAt);
  const showDecisionButtons = canDecide && !readOnly && (awaitingApproval || changingDecision);
  const hasAddress = Boolean(job.street && (job.postalCode || (job.city && job.state)));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Coverage"
          value={waterfall?.coverageRatio != null ? `${waterfall.coverageRatio.toFixed(2)}×` : "—"}
          detail={waterfall ? `Seller net ÷ ${formatCurrencyFull(waterfall.payAtCloseAmount)} due to us` : "Run the property review"}
        />
        <Metric
          label="Est. seller net"
          value={waterfall ? formatCurrencyFull(waterfall.netProceeds) : "—"}
          detail={waterfall ? `${waterfall.valueSource} ${formatCurrencyFull(waterfall.estimatedValue)}` : "After loans, liens, and closing costs"}
        />
        <Metric
          label="Due at closing"
          value={formatCurrencyFull(Math.max(0, draft.contractValue - draft.depositAmount))}
          detail={draft.expectedCloseDate ? `Expected ${formatDate(draft.expectedCloseDate)}` : "No closing date yet"}
        />
        <Metric
          label="Recommendation"
          value={report ? RECOMMENDATION_LABELS[report.recommendation] : "—"}
          detail={report ? `Score ${report.score} / 100 · ${report.flags.filter((flag) => flag.severity === "high").length} high flags` : "Not reviewed"}
          tone={report ? recommendationTone(report.recommendation) : undefined}
        />
      </div>

      <section
        className={cn(
          "space-y-3 rounded-[12px] border p-4",
          awaitingApproval ? "border-primary/40 bg-primary/5" : "bg-card",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h3 className="text-sm font-medium">Approval</h3>
            <p className="text-xs text-muted-foreground">
              {draft.requestedAt
                ? `Requested${draft.requestedByName ? ` by ${draft.requestedByName}` : ""} on ${formatDate(draft.requestedAt)}.`
                : "Opened without a formal request."}{" "}
              {decided
                ? `${draft.status === "declined" ? "Declined" : "Approved"}${draft.decidedByName ? ` by ${draft.decidedByName}` : ""} on ${formatDate(draft.decidedAt)}.`
                : awaitingApproval
                  ? canDecide
                    ? "Waiting on your decision. Run the property review first if it has not been run."
                    : "Waiting on a company admin. Only a company admin can approve or decline."
                  : "Not yet decided."}
            </p>
            {decided && draft.decisionNote ? (
              <p className="text-sm">{draft.decisionNote}</p>
            ) : null}
          </div>
          {decided && canDecide && !readOnly && !changingDecision ? (
            <Button type="button" size="sm" variant="outline" className="bg-card" onClick={() => setChangingDecision(true)}>
              Change decision
            </Button>
          ) : null}
        </div>
        {showDecisionButtons ? (
          <div className="space-y-2">
            <Textarea
              value={decisionNote}
              rows={2}
              placeholder="Optional note for the file: conditions, deposit required, why declined."
              onChange={(event) => setDecisionNote(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={saving} onClick={() => void decide("approved")}>
                <Check data-icon="inline-start" />
                Approve request
              </Button>
              <Button type="button" variant="outline" className="bg-card" disabled={saving} onClick={() => void decide("declined")}>
                <X data-icon="inline-start" />
                Decline
              </Button>
              {changingDecision ? (
                <Button type="button" variant="ghost" disabled={saving} onClick={() => setChangingDecision(false)}>
                  Cancel
                </Button>
              ) : null}
            </div>
            {report ? null : (
              <p className="text-xs text-muted-foreground">
                No property review has run yet. Run it above before deciding so the equity math is on the file.
              </p>
            )}
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-[12px] border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Deal</h3>
          <PayAtCloseStatusBadge status={draft.status} />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Status" hint={decided ? undefined : "Work statuses unlock once a company admin approves."}>
            <Select
              value={draft.status}
              disabled={readOnly}
              onValueChange={(value) => {
                if (value) patch({ status: value as PayAtCloseStatus });
              }}
              items={statusOptions.map((status) => ({ value: status, label: PAY_AT_CLOSE_STATUS_LABELS[status] }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status}>
                    {PAY_AT_CLOSE_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <MoneyField
            label="Pay-at-close amount"
            value={draft.contractValue}
            disabled={readOnly}
            onChange={(contractValue) => setDraft((c) => (c ? recompute({ ...c, contractValue }) : c))}
          />
          <MoneyField
            label="Deposit collected"
            value={draft.depositAmount}
            disabled={readOnly}
            onChange={(depositAmount) => setDraft((c) => (c ? recompute({ ...c, depositAmount }) : c))}
          />
          <Field label="Expected closing">
            <Input
              type="date"
              value={draft.expectedCloseDate ?? ""}
              disabled={readOnly}
              onChange={(event) => setDraft((c) => (c ? recompute({ ...c, expectedCloseDate: event.target.value || null }) : c))}
            />
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Listing">
            <Select
              value={draft.listingStatus || "unset"}
              disabled={readOnly}
              onValueChange={(value) =>
                setDraft((c) =>
                  c ? recompute({ ...c, listingStatus: !value || value === "unset" ? "" : (value as ListingStatus) }) : c,
                )
              }
              items={[
                { value: "unset", label: "Not set" },
                ...LISTING_STATUSES.map((status) => ({ value: status, label: LISTING_STATUS_LABELS[status] })),
              ]}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Listing" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Not set</SelectItem>
                {LISTING_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {LISTING_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <MoneyField
            label="List price"
            value={draft.listPrice}
            disabled={readOnly}
            onChange={(listPrice) => setDraft((c) => (c ? recompute({ ...c, listPrice }) : c))}
          />
          <MoneyField
            label="Sale contract price"
            value={draft.contractPrice}
            disabled={readOnly}
            onChange={(contractPrice) => setDraft((c) => (c ? recompute({ ...c, contractPrice }) : c))}
          />
          <MoneyField
            label="Seller concessions"
            value={draft.sellerConcessions}
            disabled={readOnly}
            onChange={(sellerConcessions) => setDraft((c) => (c ? recompute({ ...c, sellerConcessions }) : c))}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Who signs our agreement" hint="Checked against the owner of record.">
            <Input
              value={draft.signerNames}
              disabled={readOnly}
              placeholder="Maria Alvarez and Luis Alvarez"
              onChange={(event) => setDraft((c) => (c ? recompute({ ...c, signerNames: event.target.value }) : c))}
            />
          </Field>
          <Field label="Listing agent">
            <Input
              value={draft.listingAgent}
              disabled={readOnly}
              placeholder="Agent name, brokerage"
              onChange={(event) => patch({ listingAgent: event.target.value })}
            />
          </Field>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Title and escrow</p>
          <div className="grid gap-4 md:grid-cols-5">
            <Field label="Title company">
              <Input
                value={draft.titleCompany}
                disabled={readOnly}
                onChange={(event) => setDraft((c) => (c ? recompute({ ...c, titleCompany: event.target.value }) : c))}
              />
            </Field>
            <Field label="Escrow officer">
              <Input value={draft.escrowOfficer} disabled={readOnly} onChange={(event) => patch({ escrowOfficer: event.target.value })} />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={draft.escrowEmail}
                disabled={readOnly}
                autoComplete="off"
                onChange={(event) => patch({ escrowEmail: event.target.value })}
              />
            </Field>
            <Field label="Phone">
              <PhoneInput
                value={draft.escrowPhone}
                disabled={readOnly}
                autoComplete="off"
                onValueChange={(escrowPhone) => patch({ escrowPhone })}
              />
            </Field>
            <Field label="File number">
              <Input value={draft.escrowFileNumber} disabled={readOnly} onChange={(event) => patch({ escrowFileNumber: event.target.value })} />
            </Field>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-[12px] border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Public property record</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {property
                ? `${property.sourceName}${property.fetchedAt ? ` · pulled ${formatDate(property.fetchedAt)}` : ""}`
                : hasAddress
                  ? `Pull ownership, loans, liens, and value for ${job.location || job.street}.`
                  : "Add a street address with city and state (or ZIP) on the job first."}
            </p>
          </div>
          {readOnly ? null : (
            <div className="flex gap-2">
              {property ? (
                <Button type="button" variant="outline" size="sm" disabled={reviewing || saving} onClick={() => void runReview(true)}>
                  <RefreshCw className={cn("size-3.5", reviewing && "animate-spin")} />
                  Re-score
                </Button>
              ) : null}
              <Button type="button" size="sm" disabled={!hasAddress || reviewing || saving} onClick={() => void runReview(false)}>
                <RefreshCw className={cn("size-3.5", reviewing && "animate-spin")} />
                {reviewing ? "Reviewing…" : property ? "Pull records again" : "Run property review"}
              </Button>
            </div>
          )}
        </div>
        {property ? <PropertyFacts property={property} /> : null}
      </section>

      <section className="space-y-3 rounded-[12px] border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Liens and payoffs from the office {draft.liens.length ? draft.liens.length : ""}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Enter title commitment exceptions and payoff letters here. A verified entry replaces the public-record estimate of the same kind.
            </p>
          </div>
          {readOnly ? null : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setDraft((c) =>
                  c
                    ? recompute({
                        ...c,
                        liens: [
                          ...c.liens,
                          {
                            id: crypto.randomUUID(),
                            kind: "mortgage",
                            holder: "",
                            amount: 0,
                            recordedDate: null,
                            source: "title_commitment",
                            verified: true,
                            notes: "",
                          },
                        ],
                      })
                    : c,
                )
              }
            >
              <Plus className="size-3.5" />
              Add lien or payoff
            </Button>
          )}
        </div>
        {draft.liens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing entered yet. Public-record liens show above and in the waterfall.</p>
        ) : (
          <ul className="space-y-3">
            {draft.liens.map((lien) => (
              <li key={lien.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <Select
                  value={lien.kind}
                  disabled={readOnly}
                  onValueChange={(value) => {
                    if (value) updateLien(lien.id, { kind: value as LienKind });
                  }}
                  items={LIEN_KINDS.map((kind) => ({ value: kind, label: LIEN_KIND_LABELS[kind] }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LIEN_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {LIEN_KIND_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={lien.holder}
                  disabled={readOnly}
                  placeholder="Lender or lien holder"
                  onChange={(event) => updateLien(lien.id, { holder: event.target.value })}
                />
                <MoneyField label="" value={lien.amount} disabled={readOnly} onChange={(amount) => updateLien(lien.id, { amount })} />
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={lien.verified}
                    disabled={readOnly}
                    onCheckedChange={(value) =>
                      updateLien(lien.id, { verified: value === true, source: value === true ? "title_commitment" : "manual" })
                    }
                  />
                  Verified payoff
                </label>
                {readOnly ? (
                  <span />
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove lien"
                    onClick={() => setDraft((c) => (c ? recompute({ ...c, liens: c.liens.filter((item) => item.id !== lien.id) }) : c))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
                <p className="text-[11px] text-muted-foreground md:col-span-5">{LIEN_SOURCE_LABELS[lien.source]}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {report ? (
        <section className="space-y-4 rounded-[12px] border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">Risk report</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">Generated {formatDate(report.generatedAt)} · score {report.score} / 100</p>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={downloading} onClick={() => void downloadPdf()}>
              <Download className="size-3.5" />
              {downloading ? "Building…" : "Download PDF"}
            </Button>
          </div>
          <p className="text-sm leading-relaxed">{report.narrative}</p>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Equity waterfall</p>
              <table className="w-full text-sm">
                <tbody>
                  <WaterfallRow label={report.waterfall.valueSource} amount={report.waterfall.estimatedValue} estimated={report.waterfall.valueEstimated} strong />
                  {report.waterfall.lines.map((line) => (
                    <WaterfallRow key={line.key} label={line.label} amount={-line.amount} estimated={line.estimated} detail={line.detail} />
                  ))}
                  <WaterfallRow label="Seller closing costs and concessions" amount={-report.waterfall.closingCosts} estimated />
                  <WaterfallRow label="Estimated seller net" amount={report.waterfall.netProceeds} strong />
                  <WaterfallRow label="Due to us at closing" amount={-report.waterfall.payAtCloseAmount} />
                  <WaterfallRow label="Seller cushion after our payment" amount={report.waterfall.cushion} strong />
                </tbody>
              </table>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Flags {report.flags.length}</p>
              {report.flags.length === 0 ? (
                <p className="text-sm text-muted-foreground">No flags.</p>
              ) : (
                <ul className="space-y-2">
                  {report.flags.map((flag) => (
                    <li key={flag.code} className="rounded-md border p-2.5">
                      <div className="flex items-start gap-2">
                        <SeverityBadge severity={flag.severity} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{flag.title}</p>
                          <p className="text-xs text-muted-foreground">{flag.detail}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-2">
            <div>
              <p className="font-medium text-foreground">Assumptions</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {report.assumptions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground">Sources</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {report.sources.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      <section className="space-y-3 rounded-[12px] border bg-card p-4">
        <div>
          <h3 className="text-sm font-medium">Paperwork checklist</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            What protects our payment{job.state ? ` in ${job.state.toUpperCase()}` : ""}. Deadlines are reminders; confirm with counsel.
          </p>
        </div>
        <ul className="divide-y">
          {draft.checklist.map((item) => (
            <li key={item.key} className="flex items-start gap-3 py-2.5">
              <Checkbox
                checked={item.done}
                disabled={readOnly}
                className="mt-0.5"
                onCheckedChange={(value) =>
                  setDraft((c) =>
                    c
                      ? recompute({
                          ...c,
                          checklist: c.checklist.map((row) =>
                            row.key === item.key
                              ? { ...row, done: value === true, doneAt: value === true ? new Date().toISOString() : null }
                              : row,
                          ),
                        })
                      : c,
                  )
                }
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className={cn("text-sm font-medium", item.done && "text-muted-foreground line-through")}>{item.label}</p>
                  <span className="text-[11px] text-muted-foreground">
                    {item.done && item.doneAt ? `Done ${formatDate(item.doneAt)}` : item.dueNote}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 rounded-[12px] border bg-card p-4">
        <h3 className="text-sm font-medium">Notes</h3>
        <Textarea
          value={draft.notes}
          disabled={readOnly}
          rows={3}
          placeholder="Calls with the title company, agent updates, payoff figures."
          onChange={(event) => patch({ notes: event.target.value })}
        />
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        {readOnly ? null : (
          <>
            <Button type="button" variant="outline" className="bg-card" disabled={saving} onClick={() => setDraft(saved ?? null)}>
              Discard
            </Button>
            <Button type="button" disabled={saving} onClick={() => void persist(draft)}>
              {saving ? "Saving…" : "Save pay at close"}
            </Button>
          </>
        )}
      </div>
    </div>
  );

  function updateLien(id: string, partial: Partial<LienRecord>) {
    setDraft((c) => (c ? recompute({ ...c, liens: c.liens.map((item) => (item.id === id ? { ...item, ...partial } : item)) }) : c));
  }
}

function PropertyFacts({ property }: { property: PropertyRecord }) {
  const facts: Array<[string, string]> = [
    ["Owner of record", property.ownerNames.join(", ") || "—"],
    ["Vesting", property.vesting || "—"],
    ["APN", property.apn || "—"],
    ["Owner occupied", property.ownerOccupied == null ? "—" : property.ownerOccupied ? "Yes" : "No"],
    ["Last sale", property.lastSaleDate ? `${formatDate(property.lastSaleDate)}${property.lastSalePrice ? ` · ${formatCurrencyFull(property.lastSalePrice)}` : ""}` : "—"],
    [
      "AVM",
      property.avmValue
        ? `${formatCurrencyFull(property.avmValue)}${property.avmLow && property.avmHigh ? ` (${formatCurrencyFull(property.avmLow)} – ${formatCurrencyFull(property.avmHigh)})` : ""}${property.avmConfidence != null ? ` · ${property.avmConfidence}% confidence` : ""}`
        : "—",
    ],
    ["Assessed", property.assessedValue ? formatCurrencyFull(property.assessedValue) : "—"],
    [
      "Property tax",
      property.annualTax ? `${formatCurrencyFull(property.annualTax)} / yr${property.taxDelinquentAmount ? ` · ${formatCurrencyFull(property.taxDelinquentAmount)} delinquent` : ""}` : "—",
    ],
    [
      "Home",
      [
        property.yearBuilt ? `Built ${property.yearBuilt}` : null,
        property.livingSqFt ? `${property.livingSqFt.toLocaleString("en-US")} sq ft` : null,
        property.beds ? `${property.beds} bd` : null,
        property.baths ? `${property.baths} ba` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "—",
    ],
  ];
  const distress = [
    property.distress.noticeOfDefault ? "Notice of default" : null,
    property.distress.lisPendens ? "Lis pendens" : null,
    property.distress.bankruptcy ? "Bankruptcy" : null,
    property.distress.taxLien ? "Tax lien" : null,
  ].filter(Boolean);
  return (
    <div className="space-y-4">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
        <div>
          <dt className="text-xs text-muted-foreground">Distress</dt>
          <dd className={cn("font-medium", distress.length && "text-rose-700")}>{distress.length ? distress.join(", ") : "None found"}</dd>
        </div>
      </dl>
      <div>
        <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Recorded loans {property.mortgages.length}
        </p>
        {property.mortgages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open deeds of trust found. Free and clear is possible, but confirm with title.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-normal">Position</th>
                <th className="py-1 font-normal">Lender</th>
                <th className="py-1 font-normal">Recorded</th>
                <th className="py-1 text-right font-normal">Original</th>
                <th className="py-1 text-right font-normal">Est. balance</th>
              </tr>
            </thead>
            <tbody>
              {property.mortgages.map((mortgage) => {
                const estimate = estimateMortgageBalance(mortgage);
                return (
                  <tr key={mortgage.id} className="border-t">
                    <td className="py-1.5">{mortgage.isHeloc ? "HELOC" : `${mortgage.position}${mortgage.position === 1 ? "st" : mortgage.position === 2 ? "nd" : "rd"}`}</td>
                    <td className="py-1.5">{mortgage.lender || "—"}{mortgage.loanType ? <span className="text-muted-foreground"> · {mortgage.loanType}</span> : null}</td>
                    <td className="py-1.5">{mortgage.recordedDate ? formatDate(mortgage.recordedDate) : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatCurrencyFull(mortgage.originalAmount)}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatCurrencyFull(estimate.balance)}
                      {estimate.assumedRate && !mortgage.isHeloc ? <span className="text-muted-foreground"> @ {estimate.rateUsed.toFixed(2)}%*</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {property.mortgages.some((mortgage) => estimateMortgageBalance(mortgage).assumedRate && !mortgage.isHeloc) ? (
          <p className="mt-1 text-[11px] text-muted-foreground">* Rate assumed from the year recorded. Balances are not public.</p>
        ) : null}
      </div>
      {property.liens.length ? (
        <div>
          <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Recorded liens {property.liens.length}</p>
          <ul className="space-y-1 text-sm">
            {property.liens.map((lien) => (
              <li key={lien.id} className="flex justify-between gap-3">
                <span>
                  {LIEN_KIND_LABELS[lien.kind]}
                  {lien.holder ? ` · ${lien.holder}` : ""}
                  {lien.notes ? <span className="text-muted-foreground"> · {lien.notes}</span> : null}
                </span>
                <span className="tabular-nums">{formatCurrencyFull(lien.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function WaterfallRow({
  label,
  amount,
  estimated,
  detail,
  strong,
}: {
  label: string;
  amount: number;
  estimated?: boolean;
  detail?: string;
  strong?: boolean;
}) {
  return (
    <tr className={cn("border-t", strong && "font-medium")}>
      <td className="py-1.5 pr-3">
        <span>{label}</span>
        {estimated ? <span className="text-muted-foreground"> (est.)</span> : null}
        {detail ? <p className="text-[11px] font-normal text-muted-foreground">{detail}</p> : null}
      </td>
      <td className={cn("py-1.5 text-right tabular-nums align-top", amount < 0 && !strong && "text-muted-foreground")}>
        {amount < 0 ? `(${formatCurrencyFull(Math.abs(amount))})` : formatCurrencyFull(amount)}
      </td>
    </tr>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: string }) {
  return (
    <div className="rounded-[12px] border bg-card px-4 py-3">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className={cn("mt-2 text-xl font-semibold tabular-nums", tone)}>{value}</p>
      {detail ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function MoneyField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const input = (
    <CurrencyInput
      value={value || ""}
      disabled={disabled}
      aria-label={label || "Amount"}
      onValueChange={(text) => {
        const amount = Number(text);
        onChange(text === "" || text === "." || !Number.isFinite(amount) ? 0 : amount);
      }}
    />
  );
  if (!label) return input;
  return <Field label={label}>{input}</Field>;
}

function recommendationTone(recommendation: Recommendation) {
  if (recommendation === "approve") return "text-emerald-700";
  if (recommendation === "approve_with_deposit") return "text-sky-800";
  if (recommendation === "review") return "text-amber-700";
  return "text-rose-700";
}

export function SeverityBadge({ severity }: { severity: RiskSeverity }) {
  const tone =
    severity === "high" ? "bg-rose-50 text-rose-700" : severity === "watch" ? "bg-amber-50 text-amber-800" : "bg-muted text-muted-foreground";
  const label = severity === "high" ? "High" : severity === "watch" ? "Watch" : "Info";
  return <span className={cn("mt-0.5 inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", tone)}>{label}</span>;
}

export function PayAtCloseStatusBadge({ status }: { status: PayAtCloseStatus }) {
  const tone =
    status === "declined" || status === "fell_through"
      ? "bg-rose-50 text-rose-700"
      : status === "paid"
        ? "bg-emerald-50 text-emerald-700"
        : status === "screening"
          ? "bg-muted text-muted-foreground"
          : "bg-sky-50 text-sky-800";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", tone)}>
      <span className="size-1.5 rounded-full bg-current" />
      {PAY_AT_CLOSE_STATUS_LABELS[status]}
    </span>
  );
}
