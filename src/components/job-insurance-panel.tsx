"use client";

import { useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/currency-input";
import { PhoneInput } from "@/components/phone-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull, formatDate } from "@/lib/format";
import {
  CHECK_KIND_LABELS,
  CHECK_KINDS,
  CHECK_PAYEE_LABELS,
  CHECK_PAYEES,
  CLAIM_PERIL_LABELS,
  CLAIM_PERILS,
  CLAIM_STATUS_LABELS,
  CLAIM_STATUSES,
  SUPPLEMENT_STATUS_LABELS,
  SUPPLEMENT_STATUSES,
  claimTotals,
  emptyJobInsurance,
  type CheckKind,
  type CheckPayee,
  type ClaimCheck,
  type ClaimPeril,
  type ClaimStatus,
  type ClaimSupplement,
  type JobInsurance,
  type SupplementStatus,
} from "@/lib/insurance";
import type { Job } from "@/lib/types";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function JobInsurancePanel({ job, readOnly = false }: { job: Job; readOnly?: boolean }) {
  const crm = useCrm();
  const saved = (crm.jobInsurance ?? []).find((item) => item.jobId === job.id);
  return (
    <ClaimEditor
      key={`${saved?.id ?? "new"}:${saved?.updatedAt ?? ""}`}
      job={job}
      saved={saved}
      readOnly={readOnly}
      onSave={crm.saveJobInsurance}
    />
  );
}

function ClaimEditor({
  job,
  saved,
  readOnly,
  onSave,
}: {
  job: Job;
  saved: JobInsurance | undefined;
  readOnly: boolean;
  onSave: (claim: JobInsurance) => Promise<JobInsurance | null>;
}) {
  const [draft, setDraft] = useState<JobInsurance | null>(saved ?? null);
  const [saving, setSaving] = useState(false);

  const totals = draft ? claimTotals(draft) : null;

  async function persist(next: JobInsurance) {
    if (readOnly) return;
    setSaving(true);
    setDraft(next);
    const savedClaim = await onSave(next);
    if (!savedClaim) setSaving(false);
  }

  function patch(partial: Partial<JobInsurance>) {
    setDraft((current) => (current ? { ...current, ...partial } : current));
  }

  if (!draft) {
    return (
      <EmptyState
        title="No claim on this job yet"
        description="Track the carrier, deductible, RCV and ACV, supplements, mortgage, and every insurance check in one place."
        action={
          readOnly ? null : (
            <Button
              type="button"
              onClick={() => {
                const next = emptyJobInsurance(job.id, crypto.randomUUID());
                void persist(next);
              }}
            >
              Start the claim
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {totals ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="RCV with supplements" value={formatCurrencyFull(totals.rcvWithSupplements)} />
          <Metric label="Net after deductible" value={formatCurrencyFull(totals.netClaim)} />
          <Metric
            label="Supplements open"
            value={totals.openCount ? `${totals.openCount} · ${formatCurrencyFull(totals.openRequested)}` : "None"}
          />
          <Metric label="Still to collect" value={formatCurrencyFull(totals.outstanding)} />
        </div>
      ) : null}

      <section className="grid gap-4 rounded-md border p-4 md:grid-cols-2">
        <Field label="Carrier">
          <Input value={draft.carrier} disabled={readOnly} onChange={(event) => patch({ carrier: event.target.value })} placeholder="State Farm" />
        </Field>
        <Field label="Claim number">
          <Input value={draft.claimNumber} disabled={readOnly} onChange={(event) => patch({ claimNumber: event.target.value })} />
        </Field>
        <Field label="Policy number">
          <Input value={draft.policyNumber} disabled={readOnly} onChange={(event) => patch({ policyNumber: event.target.value })} />
        </Field>
        <Field label="Date of loss">
          <Input type="date" value={draft.dateOfLoss ?? ""} disabled={readOnly} onChange={(event) => patch({ dateOfLoss: event.target.value || null })} />
        </Field>
        <Field label="Peril">
          <Select
            value={draft.peril || "unset"}
            disabled={readOnly}
            onValueChange={(value) => patch({ peril: !value || value === "unset" ? "" : (value as ClaimPeril) })}
            items={[
              { value: "unset", label: "Not set" },
              ...CLAIM_PERILS.map((peril) => ({ value: peril, label: CLAIM_PERIL_LABELS[peril] })),
            ]}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Peril" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">Not set</SelectItem>
              {CLAIM_PERILS.map((peril) => (
                <SelectItem key={peril} value={peril}>
                  {CLAIM_PERIL_LABELS[peril]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={draft.status}
            disabled={readOnly}
            onValueChange={(value) => {
              if (value) patch({ status: value as ClaimStatus });
            }}
            items={CLAIM_STATUSES.map((status) => ({ value: status, label: CLAIM_STATUS_LABELS[status] }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLAIM_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {CLAIM_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3 md:col-span-2">
          <Field label="Adjuster">
            <Input
              value={draft.adjusterName}
              disabled={readOnly}
              autoComplete="off"
              placeholder="Name"
              onChange={(event) => patch({ adjusterName: event.target.value })}
            />
          </Field>
          <Field label="Adjuster email">
            <Input
              type="email"
              value={draft.adjusterEmail}
              disabled={readOnly}
              autoComplete="off"
              placeholder="name@carrier.com"
              onChange={(event) => patch({ adjusterEmail: event.target.value })}
            />
          </Field>
          <Field label="Adjuster phone">
            <PhoneInput
              value={draft.adjusterPhone}
              disabled={readOnly}
              autoComplete="off"
              placeholder="(720) 555-0100"
              onValueChange={(adjusterPhone) => patch({ adjusterPhone })}
            />
          </Field>
        </div>
        <Field label="Mortgage company">
          <Input value={draft.mortgageCompany} disabled={readOnly} onChange={(event) => patch({ mortgageCompany: event.target.value })} />
        </Field>
        <Field label="Loan number">
          <Input value={draft.loanNumber} disabled={readOnly} onChange={(event) => patch({ loanNumber: event.target.value })} />
        </Field>
      </section>

      <section className="grid gap-4 rounded-md border p-4 md:grid-cols-3">
        <MoneyField label="RCV" value={draft.rcv} disabled={readOnly} onChange={(rcv) => patch({ rcv })} />
        <MoneyField label="ACV" value={draft.acv} disabled={readOnly} onChange={(acv) => patch({ acv })} />
        <MoneyField label="Depreciation" value={draft.depreciation} disabled={readOnly} onChange={(depreciation) => patch({ depreciation })} />
        <MoneyField label="Deductible" value={draft.deductible} disabled={readOnly} onChange={(deductible) => patch({ deductible })} />
        <MoneyField label="Overhead & profit" value={draft.overheadProfit} disabled={readOnly} onChange={(overheadProfit) => patch({ overheadProfit })} />
        <label className="flex items-end gap-2 pb-2 text-sm">
          <Checkbox
            checked={draft.recoverable}
            disabled={readOnly}
            onCheckedChange={(value) => patch({ recoverable: value === true })}
          />
          Recoverable depreciation
        </label>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[11px] font-semibold tracking-[0.16em] uppercase">Supplements</h3>
          {readOnly ? null : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                patch({
                  supplements: [
                    ...draft.supplements,
                    {
                      id: crypto.randomUUID(),
                      title: "",
                      status: "draft",
                      requested: 0,
                      approved: 0,
                      submittedAt: null,
                      decidedAt: null,
                      notes: "",
                    },
                  ],
                })
              }
            >
              <Plus className="size-3.5" />
              Add supplement
            </Button>
          )}
        </div>
        {draft.supplements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No supplements yet. Add one when the carrier leaves money off the scope.</p>
        ) : (
          <ul className="space-y-3">
            {draft.supplements.map((supplement) => (
              <li key={supplement.id} className="space-y-3 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={supplement.title}
                    disabled={readOnly}
                    placeholder="Skylights, drip edge, code upgrade"
                    className="min-w-48 flex-1"
                    onChange={(event) => updateSupplement(draft, supplement.id, { title: event.target.value }, patch)}
                  />
                  <Select
                    value={supplement.status}
                    disabled={readOnly}
                    onValueChange={(value) => {
                      if (!value) return;
                      const status = value as SupplementStatus;
                      const approved =
                        (status === "approved" || status === "partial") && supplement.approved === 0
                          ? supplement.requested
                          : supplement.approved;
                      updateSupplement(draft, supplement.id, { status, approved }, patch);
                    }}
                    items={SUPPLEMENT_STATUSES.map((status) => ({
                      value: status,
                      label: SUPPLEMENT_STATUS_LABELS[status],
                    }))}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPLEMENT_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {SUPPLEMENT_STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {readOnly ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove supplement"
                      onClick={() =>
                        patch({
                          supplements: draft.supplements.filter((item) => item.id !== supplement.id),
                          checks: draft.checks.map((check) =>
                            check.supplementId === supplement.id ? { ...check, supplementId: null } : check,
                          ),
                        })
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MoneyField
                    label="Requested"
                    value={supplement.requested}
                    disabled={readOnly}
                    onChange={(requested) => updateSupplement(draft, supplement.id, { requested }, patch)}
                  />
                  <MoneyField
                    label="Approved"
                    value={supplement.approved}
                    disabled={readOnly}
                    onChange={(approved) => updateSupplement(draft, supplement.id, { approved }, patch)}
                  />
                  <Field label="Submitted">
                    <Input
                      type="date"
                      value={supplement.submittedAt ?? ""}
                      disabled={readOnly}
                      onChange={(event) =>
                        updateSupplement(draft, supplement.id, { submittedAt: event.target.value || null }, patch)
                      }
                    />
                  </Field>
                  <Field label="Decided">
                    <Input
                      type="date"
                      value={supplement.decidedAt ?? ""}
                      disabled={readOnly}
                      onChange={(event) =>
                        updateSupplement(draft, supplement.id, { decidedAt: event.target.value || null }, patch)
                      }
                    />
                  </Field>
                </div>
                <Textarea
                  value={supplement.notes}
                  disabled={readOnly}
                  rows={2}
                  placeholder="What the carrier left off, and what they said back"
                  onChange={(event) => updateSupplement(draft, supplement.id, { notes: event.target.value }, patch)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[11px] font-semibold tracking-[0.16em] uppercase">Insurance checks</h3>
          {readOnly ? null : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                patch({
                  checks: [
                    ...draft.checks,
                    {
                      id: crypto.randomUUID(),
                      kind: "acv",
                      payee: "homeowner",
                      amount: 0,
                      receivedAt: new Date().toISOString().slice(0, 10),
                      reference: "",
                      supplementId: null,
                      notes: "",
                    },
                  ],
                })
              }
            >
              <Plus className="size-3.5" />
              Record a check
            </Button>
          )}
        </div>
        {draft.checks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Collected so far {formatCurrencyFull(totals?.collected ?? 0)}. Record ACV, depreciation, and supplement checks as they land.
          </p>
        ) : (
          <ul className="space-y-3">
            {draft.checks.map((check) => (
              <li key={check.id} className="grid gap-3 rounded-md border p-3 lg:grid-cols-[8rem_10rem_8rem_8rem_8rem_minmax(0,1fr)_auto]">
                <Select
                  value={check.kind}
                  disabled={readOnly}
                  onValueChange={(value) => {
                    if (value) updateCheck(draft, check.id, { kind: value as CheckKind }, patch);
                  }}
                  items={CHECK_KINDS.map((kind) => ({ value: kind, label: CHECK_KIND_LABELS[kind] }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHECK_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {CHECK_KIND_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={check.payee}
                  disabled={readOnly}
                  onValueChange={(value) => {
                    if (value) updateCheck(draft, check.id, { payee: value as CheckPayee }, patch);
                  }}
                  items={CHECK_PAYEES.map((payee) => ({ value: payee, label: CHECK_PAYEE_LABELS[payee] }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHECK_PAYEES.map((payee) => (
                      <SelectItem key={payee} value={payee}>
                        {CHECK_PAYEE_LABELS[payee]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <MoneyField label="" value={check.amount} disabled={readOnly} onChange={(amount) => updateCheck(draft, check.id, { amount }, patch)} />
                <Input
                  type="date"
                  value={check.receivedAt}
                  disabled={readOnly}
                  aria-label="Check date"
                  onChange={(event) => updateCheck(draft, check.id, { receivedAt: event.target.value }, patch)}
                />
                <Input
                  value={check.reference}
                  disabled={readOnly}
                  placeholder="Check #"
                  onChange={(event) => updateCheck(draft, check.id, { reference: event.target.value }, patch)}
                />
                <Input
                  value={check.notes}
                  disabled={readOnly}
                  placeholder="Note"
                  onChange={(event) => updateCheck(draft, check.id, { notes: event.target.value }, patch)}
                />
                {readOnly ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove check"
                    onClick={() => patch({ checks: draft.checks.filter((item) => item.id !== check.id) })}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {draft.checks.length > 0 && totals ? (
          <p className="text-sm text-muted-foreground">
            Collected {formatCurrencyFull(totals.collected)}
            {draft.recoverable ? ` · depreciation on the claim ${formatCurrencyFull(draft.depreciation)}` : ""}
          </p>
        ) : null}
      </section>

      <section className="space-y-1.5">
        <Label htmlFor={`claim-notes-${job.id}`}>Notes</Label>
        <Textarea
          id={`claim-notes-${job.id}`}
          value={draft.notes}
          disabled={readOnly}
          rows={3}
          placeholder="What the adjuster is waiting on"
          onChange={(event) => patch({ notes: event.target.value })}
        />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          <AdjusterLine claim={draft} />
          {draft.dateOfLoss
            ? `${draft.adjusterName.trim() || draft.adjusterEmail.trim() || draft.adjusterPhone.trim() ? " · " : ""}Loss ${formatDate(draft.dateOfLoss)}`
            : ""}
        </p>
        {readOnly ? null : (
          <Button type="button" disabled={saving} onClick={() => void persist(draft)}>
            {saving ? "Saving…" : "Save claim"}
          </Button>
        )}
      </div>
    </div>
  );
}

function AdjusterLine({ claim }: { claim: JobInsurance }) {
  const name = claim.adjusterName.trim();
  const email = claim.adjusterEmail.trim();
  const phone = claim.adjusterPhone.trim();
  if (!name && !email && !phone) return null;
  return (
    <>
      {name ? <span>{name}</span> : null}
      {email ? (
        <>
          {name ? " · " : null}
          <a href={`mailto:${email}`} className="hover:underline">
            {email}
          </a>
        </>
      ) : null}
      {phone ? (
        <>
          {name || email ? " · " : null}
          <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="hover:underline">
            {phone}
          </a>
        </>
      ) : null}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-3">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-sm font-medium tabular-nums">{value}</p>
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

function updateSupplement(
  draft: JobInsurance,
  id: string,
  partial: Partial<ClaimSupplement>,
  patch: (partial: Partial<JobInsurance>) => void,
) {
  patch({
    supplements: draft.supplements.map((item) => (item.id === id ? { ...item, ...partial } : item)),
  });
}

function updateCheck(
  draft: JobInsurance,
  id: string,
  partial: Partial<ClaimCheck>,
  patch: (partial: Partial<JobInsurance>) => void,
) {
  patch({
    checks: draft.checks.map((item) => (item.id === id ? { ...item, ...partial } : item)),
  });
}

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  return <Badge variant={status === "denied" ? "destructive" : status === "closed" ? "secondary" : "outline"}>{CLAIM_STATUS_LABELS[status]}</Badge>;
}
