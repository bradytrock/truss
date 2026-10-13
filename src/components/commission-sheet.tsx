"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { downloadCloseoutPdf } from "@/lib/commission-closeout-pdf";
import { useCrm } from "@/lib/crm-store";
import {
  COMPARE_STATUS_LABELS,
  CLOSEOUT_STATUS_LABELS,
  type CommissionCloseout,
  type CommissionQbLine,
  type CommissionSheet,
  type CommissionSplitLine,
} from "@/lib/commission-closeout";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const LOCKED_SPLITS = new Set(["pm", "advertising", "other", "truck", "warranty", "draw"]);

function money(value: number) {
  return formatMoney(value);
}

function ratio(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  const percent = value * 100;
  const digits = Number.isInteger(percent) ? 0 : 1;
  return `${percent.toFixed(digits)}%`;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className="truncate text-sm">{value || "—"}</p>
    </div>
  );
}

export function CommissionSheetView({
  sheet,
  closeout,
  editing = false,
  onSplit,
  onAddSplit,
  onRemoveSplit,
  qbLines = [],
  onQb,
  onAddQb,
  onRemoveQb,
  onPullPosted,
  varianceAck = false,
  onVarianceAck,
}: {
  sheet: CommissionSheet;
  closeout?: CommissionCloseout | null;
  editing?: boolean;
  qbLines?: CommissionQbLine[];
  onSplit?: (id: string, patch: Partial<CommissionSplitLine>) => void;
  onAddSplit?: () => void;
  onRemoveSplit?: (id: string) => void;
  onQb?: (id: string, patch: Partial<CommissionQbLine>) => void;
  onAddQb?: () => void;
  onRemoveQb?: (id: string) => void;
  onPullPosted?: () => void;
  varianceAck?: boolean;
  onVarianceAck?: (checked: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Commission closeout</p>
          <p className="text-sm text-muted-foreground">
            {closeout ? CLOSEOUT_STATUS_LABELS[closeout.status] : "Not submitted"}
            {closeout?.submittedByName ? ` · submitted by ${closeout.submittedByName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {closeout?.submittedAt ? (
            <p className="text-xs text-muted-foreground">{formatDate(closeout.submittedAt)}</p>
          ) : null}
          <CloseoutPdfButton sheet={sheet} closeout={closeout} />
        </div>
      </div>

      <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Customer" value={sheet.customerName} />
        <Field label="Project address" value={sheet.projectAddress} />
        <Field label="Project manager" value={sheet.projectManager} />
        <Field label="Lead" value={sheet.lead} />
        <Field label="Phone" value={sheet.phone} />
        <Field label="Email" value={sheet.email} />
        <Field label="Closing date" value={sheet.closingDate ? formatDate(sheet.closingDate) : ""} />
        <Field label="Job #" value={sheet.jobCode} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[28rem] text-sm">
            <caption className="border-b px-3 py-2 text-left text-[11px] font-semibold tracking-[0.16em] uppercase">
              Income
            </caption>
            <thead>
              <tr className="text-left text-[10px] tracking-wide text-muted-foreground uppercase">
                <th className="px-3 py-1.5 font-medium">Payment</th>
                <th className="px-3 py-1.5 font-medium">Amount</th>
                <th className="px-3 py-1.5 font-medium">Pay method</th>
                <th className="px-3 py-1.5 text-right font-medium">CC fees</th>
              </tr>
            </thead>
            <tbody>
              {sheet.payments.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-muted-foreground" colSpan={4}>
                    No posted payments on this job yet.
                  </td>
                </tr>
              ) : (
                sheet.payments.map((payment) => (
                  <tr key={payment.label} className="border-t">
                    <td className="px-3 py-1.5">{payment.label}</td>
                    <td className="px-3 py-1.5 tabular-nums">{money(payment.amount)}</td>
                    <td className="px-3 py-1.5">{payment.method}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{money(payment.ccFee)}</td>
                  </tr>
                ))
              )}
              {sheet.hiddenPayments > 0 ? (
                <tr className="border-t">
                  <td className="px-3 py-1.5 text-muted-foreground" colSpan={4}>
                    {sheet.hiddenPayments} more payment{sheet.hiddenPayments === 1 ? "" : "s"} are in the totals.
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tbody className="border-t">
              <Total label="Payments received" value={sheet.paymentsReceived} labelSpan={3} />
              <Total label="Merchant fees 4%" value={sheet.merchantFees} labelSpan={3} />
              <Total label="Customer refund" value={sheet.customerRefund} labelSpan={3} />
              <Total label="Total payments" value={sheet.totalPayments} labelSpan={3} strong />
              <Total label="Job sold amount" value={sheet.jobSold} labelSpan={3} strong />
            </tbody>
          </table>
        </section>

        <section className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[32rem] text-sm">
            <caption className="border-b px-3 py-2 text-left text-[11px] font-semibold tracking-[0.16em] uppercase">
              Scope
            </caption>
            <thead>
              <tr className="text-right text-[10px] tracking-wide text-muted-foreground uppercase">
                <th className="px-3 py-1.5 text-left font-medium" />
                <th className="px-3 py-1.5 font-medium">ISOW</th>
                <th className="px-3 py-1.5 font-medium">TSOW</th>
                <th className="px-3 py-1.5 font-medium">ZSOW</th>
                <th className="px-3 py-1.5 font-medium">Difference</th>
              </tr>
            </thead>
            <tbody>
              {sheet.scopes.map((row) => (
                <tr key={row.label} className="border-t">
                  <td className="px-3 py-1.5">{row.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(row.isow)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(row.tsow)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(row.zsow)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{ratio(row.difference)}</td>
                </tr>
              ))}
              <tr className="border-t font-medium">
                <td className="px-3 py-1.5">Total</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(sheet.scopeTotals.isow)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(sheet.scopeTotals.tsow)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(sheet.scopeTotals.zsow)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{ratio(sheet.scopeTotals.difference)}</td>
              </tr>
            </tbody>
          </table>
          <dl className="grid grid-cols-2 gap-2 border-t px-3 py-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Carrier</dt>
              <dd>{sheet.carrier || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">O&P</dt>
              <dd className="tabular-nums">{money(sheet.overheadProfit)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">RCV</dt>
              <dd className="tabular-nums">{money(sheet.rcv)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Est. profit</dt>
              <dd className="tabular-nums">{sheet.estProfit == null ? "—" : money(sheet.estProfit)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Actual profit</dt>
              <dd className="tabular-nums">{money(sheet.actualProfit)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">ZSOW due</dt>
              <dd className="tabular-nums">{money(sheet.due)}</dd>
            </div>
          </dl>
          <p className="px-3 pb-3 text-xs text-muted-foreground">
            ISOW is the insurance scope. TSOW is the sold contract. ZSOW is what this closeout settles, after the deductible when there is a claim.
          </p>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <caption className="border-b px-3 py-2 text-left text-[11px] font-semibold tracking-[0.16em] uppercase">
              Expenses
            </caption>
            <tbody>
              {sheet.expenseLines.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-muted-foreground" colSpan={2}>
                    No expenses on this job yet.
                  </td>
                </tr>
              ) : (
                sheet.expenseLines.map((line) => (
                  <tr key={line.id} className="border-t">
                    <td className="px-3 py-1.5">
                      {line.vendor}
                      {line.forecasted ? <span className="ml-2 text-xs text-muted-foreground">Forecast</span> : null}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{money(line.amount)}</td>
                  </tr>
                ))
              )}
              <Total label="Total expenses" value={sheet.totalExpenses} strong />
              <tr className="border-t">
                <td className="px-3 py-1.5">Profit margin</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{ratio(sheet.margin)}</td>
              </tr>
              <Total label="Total profit" value={sheet.profit} strong />
            </tbody>
          </table>
        </section>

        <section className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[36rem] text-sm">
            <caption className="border-b px-3 py-2 text-left text-[11px] font-semibold tracking-[0.16em] uppercase">
              Commission
            </caption>
            <thead>
              <tr className="text-right text-[10px] tracking-wide text-muted-foreground uppercase">
                <th className="px-2 py-1.5 text-left font-medium">Split</th>
                <th className="px-2 py-1.5 font-medium">%</th>
                <th className="px-2 py-1.5 font-medium">Comm $</th>
                <th className="px-2 py-1.5 font-medium">Trades</th>
                <th className="px-2 py-1.5 font-medium">Draw</th>
                <th className="px-2 py-1.5 font-medium">Check $</th>
                {editing ? <th className="px-2 py-1.5" /> : null}
              </tr>
            </thead>
            <tbody>
              {sheet.splits.map((line) => (
                <tr key={line.id} className="border-t">
                  <td className="px-2 py-1">
                    {editing && !LOCKED_SPLITS.has(line.id) ? (
                      <Input
                        value={line.label}
                        aria-label={`${line.label} name`}
                        onChange={(event) => onSplit?.(line.id, { label: event.target.value })}
                        className="h-7"
                      />
                    ) : (
                      line.label
                    )}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {editing ? (
                      <Input
                        value={line.percent ?? ""}
                        inputMode="decimal"
                        aria-label={`${line.label} percent`}
                        onChange={(event) => {
                          const raw = event.target.value.trim();
                          onSplit?.(line.id, {
                            percent: raw === "" ? null : Number(raw),
                            flat: raw === "" ? line.flat : 0,
                          });
                        }}
                        className="h-7 text-right"
                      />
                    ) : (
                      <span className="tabular-nums">{line.percent == null ? "—" : `${line.percent}%`}</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {editing && line.percent == null ? (
                      <Input
                        value={line.flat}
                        inputMode="decimal"
                        aria-label={`${line.label} amount`}
                        onChange={(event) => onSplit?.(line.id, { flat: Number(event.target.value) || 0 })}
                        className="h-7 text-right"
                      />
                    ) : (
                      <span className="tabular-nums">{money(line.comm)}</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {editing ? (
                      <Input
                        value={line.trades}
                        inputMode="decimal"
                        aria-label={`${line.label} trades`}
                        onChange={(event) => onSplit?.(line.id, { trades: Number(event.target.value) || 0 })}
                        className="h-7 text-right"
                      />
                    ) : (
                      <span className="tabular-nums">{money(line.trades)}</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {editing ? (
                      <Input
                        value={line.draw}
                        inputMode="decimal"
                        aria-label={`${line.label} draw`}
                        onChange={(event) => onSplit?.(line.id, { draw: Number(event.target.value) || 0 })}
                        className="h-7 text-right"
                      />
                    ) : (
                      <span className="tabular-nums">{money(line.draw)}</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{money(line.check)}</td>
                  {editing ? (
                    <td className="px-2 py-1 text-right">
                      {LOCKED_SPLITS.has(line.id) ? null : (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:underline"
                          onClick={() => onRemoveSplit?.(line.id)}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
              <tr className="border-t font-medium">
                <td className="px-2 py-1.5">Total</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {sheet.splitTotals.percent == null ? "—" : `${sheet.splitTotals.percent}%`}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(sheet.splitTotals.comm)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(sheet.splitTotals.trades)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(sheet.splitTotals.draw)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(sheet.splitTotals.check)}</td>
                {editing ? <td /> : null}
              </tr>
            </tbody>
          </table>
          {editing ? (
            <div className="border-t px-3 py-2">
              <Button type="button" size="sm" variant="outline" onClick={onAddSplit}>
                Add payee
              </Button>
            </div>
          ) : null}
          <p className="border-t px-3 py-2 text-center text-xs text-muted-foreground">
            Payee checks come out of the project manager’s check. Warranty, trades, and draws stay on their own lines.
            {sheet.validationOnly ? " These numbers are for validation only until accounting accepts the costs." : ""}
          </p>
        </section>
      </div>

      {sheet.expensesAreForecasted ? (
        <div className="rounded-md bg-[#ffe14a] px-4 py-3 text-sm font-medium text-[#181818]">
          All job expenses in this project are FORECASTED.
        </div>
      ) : sheet.costBasis === "mixed" ? (
        <div className="rounded-md bg-[#ffe14a] px-4 py-3 text-sm text-[#181818]">
          Some costs are still forecasted. Total expenses uses the bills already on the job.
        </div>
      ) : sheet.costBasis === "none" ? (
        <div className="rounded-md border border-[#f0994f] bg-[#fff8f0] px-4 py-3 text-sm">
          This job has no expenses yet.
        </div>
      ) : null}

      {closeout?.accountingNote ? (
        <p className="rounded-md border px-3 py-2 text-sm">
          <span className="font-medium">Accounting: </span>
          {closeout.accountingNote}
        </p>
      ) : null}
      {closeout?.notes ? <p className="text-sm text-muted-foreground">Note: {closeout.notes}</p> : null}

      <section className="overflow-x-auto rounded-md border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">QuickBooks and CRM expenses</p>
            <p className="text-xs text-muted-foreground">
              Posted bills start from what this CRM sent to QuickBooks. Add any bill that is in QuickBooks and not on the job.
            </p>
          </div>
          {editing ? (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={onPullPosted}>
                Pull posted bills
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onAddQb}>
                Add QuickBooks bill
              </Button>
            </div>
          ) : null}
        </div>
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="text-left text-[10px] tracking-wide text-muted-foreground uppercase">
              <th className="px-3 py-1.5 font-medium">Vendor</th>
              <th className="px-3 py-1.5 text-right font-medium">CRM</th>
              <th className="px-3 py-1.5 text-right font-medium">QuickBooks</th>
              <th className="px-3 py-1.5 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {sheet.compare.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-muted-foreground" colSpan={4}>
                  Nothing to compare yet.
                </td>
              </tr>
            ) : (
              sheet.compare.map((row) => (
                <tr key={row.key} className="border-t">
                  <td className="px-3 py-1.5">{row.vendor}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {row.crm ? money(row.crm.amount) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {row.qb ? money(row.qb.amount) : "—"}
                    {row.qb?.txnId ? <span className="ml-2 text-xs text-muted-foreground">{row.qb.txnId}</span> : null}
                  </td>
                  <td className={cn("px-3 py-1.5", row.status === "match" ? "" : "text-[#9a3412]")}>
                    {COMPARE_STATUS_LABELS[row.status]}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {editing && onQb ? (
          <div className="space-y-2 border-t px-3 py-3">
            <QbEditor lines={qbLines} onQb={onQb} onRemoveQb={onRemoveQb} />
          </div>
        ) : null}
        {editing && sheet.needsAck ? (
          <label className="flex items-start gap-2 border-t px-3 py-3 text-sm">
            <Checkbox
              checked={varianceAck}
              onCheckedChange={(checked) => onVarianceAck?.(checked === true)}
              aria-label="Acknowledge cost differences"
            />
            <span>I reviewed the forecast and the QuickBooks differences. The check amounts can go to payout.</span>
          </label>
        ) : null}
      </section>
    </div>
  );
}

function CloseoutPdfButton({
  sheet,
  closeout,
}: {
  sheet: CommissionSheet;
  closeout?: CommissionCloseout | null;
}) {
  const crm = useCrm();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      await downloadCloseoutPdf({ sheet, closeout, company: crm.company });
    } catch {
      toast.error("Could not build the closeout PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void download()}>
      {busy ? "Building PDF…" : "Closeout PDF"}
    </Button>
  );
}

function QbEditor({
  lines,
  onQb,
  onRemoveQb,
}: {
  lines: CommissionQbLine[];
  onQb: (id: string, patch: Partial<CommissionQbLine>) => void;
  onRemoveQb?: (id: string) => void;
}) {
  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground">No QuickBooks rows yet.</p>;
  }
  return (
    <div className="space-y-2">
      {lines.map((line) => (
        <div key={line.id} className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_8rem_8rem_auto]">
          <Input
            value={line.vendor}
            aria-label="QuickBooks vendor"
            onChange={(event) => onQb(line.id, { vendor: event.target.value })}
            className="h-8"
          />
          <Input
            value={line.amount}
            inputMode="decimal"
            aria-label="QuickBooks amount"
            onChange={(event) => onQb(line.id, { amount: Number(event.target.value) || 0 })}
            className="h-8 text-right"
          />
          <Input
            value={line.txnId}
            aria-label="QuickBooks transaction"
            placeholder="Txn id"
            onChange={(event) => onQb(line.id, { txnId: event.target.value })}
            className="h-8"
          />
          <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => onRemoveQb?.(line.id)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function Total({
  label,
  value,
  strong = false,
  labelSpan = 1,
}: {
  label: string;
  value: number;
  strong?: boolean;
  labelSpan?: number;
}) {
  return (
    <tr className="border-t">
      <td className={cn("px-3 py-1.5", strong && "font-medium")} colSpan={labelSpan}>
        {label}
      </td>
      <td className={cn("px-3 py-1.5 text-right tabular-nums", strong && "font-medium")}>{money(value)}</td>
    </tr>
  );
}
