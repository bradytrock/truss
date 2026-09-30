"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import {
  clampAverageMarginPercent,
  type JobPnlComparison,
  type PnlLine,
  type PnlSection,
  type ProfitAndLossStatement,
} from "@/lib/profit-and-loss";
import { cn } from "@/lib/utils";

function pnlAmount(value: number) {
  const text = formatMoney(Math.abs(value));
  return value < 0 ? `(${text})` : text;
}

function LineRow({ line, depth }: { line: PnlLine; depth: number }) {
  const children = line.children ?? [];
  const expandable = children.length > 0;
  const [open, setOpen] = useState(false);
  const pad = depth === 0 ? "pl-5" : "pl-14";

  if (!expandable) {
    return (
      <li className={cn("flex min-w-0 items-baseline gap-1 py-0.5 text-sm", pad)}>
        {depth === 0 ? <span className="size-3 shrink-0" aria-hidden /> : null}
        {line.href ? (
          <Link href={line.href} className="min-w-0 flex-1 truncate hover:underline">
            {line.label}
          </Link>
        ) : (
          <span className="min-w-0 flex-1 truncate">{line.label}</span>
        )}
        <span className="shrink-0 tabular-nums text-muted-foreground">{pnlAmount(line.amount)}</span>
      </li>
    );
  }

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn("flex w-full items-center gap-1 py-0.5 text-left text-sm hover:bg-muted/50", pad)}
        aria-expanded={open}
      >
        <ChevronRight
          className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
        />
        <span className="min-w-0 flex-1 truncate">{line.label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{pnlAmount(line.amount)}</span>
      </button>
      {open ? (
        <ul className="min-w-0">
          {children.map((child) => (
            <LineRow key={child.id} line={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function SectionBlock({
  section,
  open,
  onToggle,
}: {
  section: PnlSection;
  open: boolean;
  onToggle: () => void;
}) {
  const lines = section.lines.length
    ? section.lines
    : [{ id: `${section.id}-empty`, label: section.emptyLine, amount: 0 }];
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1 py-1.5 text-left text-sm font-medium"
        aria-expanded={open}
      >
        <ChevronRight
          className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
        />
        <span className="min-w-0 flex-1">{section.label}</span>
        {!open ? (
          <span className="tabular-nums">{pnlAmount(section.total)}</span>
        ) : null}
      </button>
      {open ? (
        <>
          <ul className="min-w-0">
            {lines.map((line) => (
              <LineRow key={line.id} line={line} depth={0} />
            ))}
          </ul>
          <div className="mt-1 flex items-baseline justify-between gap-4 border-t py-1.5 pl-5 text-sm font-medium">
            <span>{section.totalLabel}</span>
            <span className="tabular-nums">{pnlAmount(section.total)}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

function varianceClass(delta: number, invert = false) {
  const good = invert ? delta <= 0 : delta >= 0;
  if (delta === 0) return "text-muted-foreground";
  return good ? "text-emerald-700" : "text-red-700";
}

function CompareAmount({
  value,
  empty = false,
  invert = false,
}: {
  value: number | null;
  empty?: boolean;
  invert?: boolean;
}) {
  if (empty || value == null) return <span className="text-muted-foreground">—</span>;
  return <span className={cn("tabular-nums", varianceClass(value, invert))}>{pnlAmount(value)}</span>;
}

function ComparisonRow({
  label,
  projected,
  actual,
  invert = false,
  emphasize = false,
}: {
  label: string;
  projected: number | null;
  actual: number;
  invert?: boolean;
  emphasize?: boolean;
}) {
  const delta = projected == null ? null : actual - projected;
  return (
    <tr className={cn(emphasize && "border-t font-medium")}>
      <th className="py-1.5 text-left font-medium">{label}</th>
      <td className="py-1.5 text-right tabular-nums text-muted-foreground">
        {projected == null ? "—" : pnlAmount(projected)}
      </td>
      <td className="py-1.5 text-right tabular-nums">{pnlAmount(actual)}</td>
      <td className="py-1.5 text-right">
        <CompareAmount value={delta} invert={invert} />
      </td>
    </tr>
  );
}

export type ProjectedMarginEditor = {
  /** Saved average. Null uses estimate costs and forecasted expenses. */
  percent: number | null;
  /** Company-wide actual net margin, when any job has income. */
  companyAverage: number | null;
  onChange: (percent: number | null) => boolean | Promise<boolean>;
};

function ProjectedMarginEditorRow({
  percent: savedPercent,
  companyAverage,
  onChange,
}: ProjectedMarginEditor) {
  const [draft, setDraft] = useState(savedPercent == null ? "" : String(savedPercent));
  const [sourcePercent, setSourcePercent] = useState(savedPercent);
  if (sourcePercent !== savedPercent) {
    setSourcePercent(savedPercent);
    setDraft(savedPercent == null ? "" : String(savedPercent));
  }

  async function commit(raw: string) {
    const trimmed = raw.trim().replace(/%$/, "");
    if (!trimmed) {
      if (savedPercent != null) {
        const ok = await onChange(null);
        if (!ok) setDraft(String(savedPercent));
      }
      return;
    }
    const next = clampAverageMarginPercent(Number(trimmed));
    if (next == null || (savedPercent != null && next === savedPercent)) {
      setDraft(savedPercent == null ? "" : String(savedPercent));
      return;
    }
    const ok = await onChange(next);
    if (!ok) setDraft(savedPercent == null ? "" : String(savedPercent));
  }

  const averageToApply =
    companyAverage != null &&
    (savedPercent == null || Math.abs(companyAverage - savedPercent) >= 0.01)
      ? companyAverage
      : null;

  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Margin
        </p>
        <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
          {savedPercent == null
            ? companyAverage == null
              ? "Type a margin percent. Projected profit becomes that share of income, without forecasted expenses."
              : "Type a margin percent, or use the company average. Projected profit becomes that share of income, without forecasted expenses."
            : "This percent of income is the projected profit. Forecasted expenses stay listed and are left out of the projection."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="sr-only">Average margin percent</span>
          <Input
            type="number"
            inputMode="decimal"
            min={-100}
            max={100}
            step="0.1"
            aria-label="Average margin percent"
            className="h-8 w-20 tabular-nums"
            value={draft}
            placeholder="—"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void commit(draft)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
          <span>%</span>
        </label>
        {averageToApply != null ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void onChange(averageToApply)}
          >
            Use {averageToApply.toFixed(1)}% average
          </Button>
        ) : null}
        {savedPercent != null ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void onChange(null)}
          >
            Use estimate costs
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function JobPnlComparisonTable({
  statement,
  comparison,
  marginEditor,
}: {
  statement: ProfitAndLossStatement;
  comparison: JobPnlComparison;
  marginEditor?: ProjectedMarginEditor;
}) {
  const actualProfit = statement.netIncome;
  const projectedProfit = comparison.projectedNetIncome;
  const profitDelta = projectedProfit == null ? null : actualProfit - projectedProfit;
  const projectedMargin =
    comparison.projectedIncome > 0 && comparison.projectedNetIncome != null
      ? comparison.projectedNetIncome / comparison.projectedIncome
      : null;
  const actualMargin = statement.income.total > 0 ? statement.netIncome / statement.income.total : null;

  return (
    <div className="border bg-card px-5 py-5 sm:px-8">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-heading text-sm font-medium tracking-[0.14em] uppercase">
            Actual vs projected
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {comparison.estimateId ? (
              <>
                Projected from{" "}
                <Link href={`/estimates/${comparison.estimateId}`} className="hover:underline">
                  {comparison.estimateLabel}
                </Link>
              </>
            ) : (
              `Projected from ${comparison.estimateLabel ?? "the contract"}`
            )}
            {comparison.marginBasis === "average" && comparison.averageMarginPercent != null
              ? ` using a ${comparison.averageMarginPercent.toFixed(1)}% average margin`
              : ""}
            . Variance is actual minus projected.
          </p>
        </div>
        <p className={cn("text-sm tabular-nums", profitDelta == null ? "text-muted-foreground" : varianceClass(profitDelta))}>
          {profitDelta == null
            ? "Profit variance —"
            : `${profitDelta >= 0 ? "Ahead" : "Behind"} ${pnlAmount(Math.abs(profitDelta))}`}
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="border px-3 py-2.5">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Projected profit
          </p>
          <p className="mt-1 text-lg tabular-nums">
            {comparison.projectedNetIncome == null ? "—" : pnlAmount(comparison.projectedNetIncome)}
          </p>
          <p className="text-xs text-muted-foreground">
            {comparison.marginBasis === "average" && comparison.averageMarginPercent != null
              ? `${comparison.averageMarginPercent.toFixed(1)}% average margin`
              : projectedMargin == null
                ? "Margin —"
                : `${(projectedMargin * 100).toFixed(1)}% margin`}
          </p>
        </div>
        <div className="border px-3 py-2.5">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Actual profit
          </p>
          <p className="mt-1 text-lg tabular-nums">{pnlAmount(actualProfit)}</p>
          <p className="text-xs text-muted-foreground">
            {actualMargin == null ? "Margin —" : `${(actualMargin * 100).toFixed(1)}% margin`}
          </p>
        </div>
        <div className="border px-3 py-2.5">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Variance
          </p>
          <p className={cn("mt-1 text-lg tabular-nums", profitDelta == null ? "" : varianceClass(profitDelta))}>
            {profitDelta == null ? "—" : pnlAmount(profitDelta)}
          </p>
          <p className="text-xs text-muted-foreground">
            {actualMargin == null || projectedMargin == null
              ? "Margin pts —"
              : `${((actualMargin - projectedMargin) * 100).toFixed(1)} pts`}
          </p>
        </div>
      </div>

      {marginEditor ? <ProjectedMarginEditorRow {...marginEditor} /> : null}

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            <th className="py-1.5 text-left font-semibold"> </th>
            <th className="py-1.5 text-right font-semibold">Projected</th>
            <th className="py-1.5 text-right font-semibold">Actual</th>
            <th className="py-1.5 text-right font-semibold">Variance</th>
          </tr>
        </thead>
        <tbody>
          <ComparisonRow label="Income" projected={comparison.projectedIncome} actual={statement.income.total} />
          <ComparisonRow
            label="Cost of sales"
            projected={comparison.projectedCostOfSales}
            actual={statement.costOfSales.total}
            invert
          />
          <ComparisonRow
            label="Gross profit"
            projected={comparison.projectedGrossProfit}
            actual={statement.grossProfit}
            emphasize
          />
          <ComparisonRow
            label="Expenses"
            projected={comparison.projectedExpenses}
            actual={statement.expenses.total + statement.otherExpenses.total}
            invert
          />
          <ComparisonRow
            label="Net income"
            projected={comparison.projectedNetIncome}
            actual={statement.netIncome}
            emphasize
          />
        </tbody>
      </table>
    </div>
  );
}

export function ProfitAndLossReport({
  statement,
  className,
}: {
  statement: ProfitAndLossStatement;
  className?: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({
    income: true,
    cos: true,
    expenses: true,
    other: true,
  });

  function toggle(id: string) {
    setOpen((current) => ({ ...current, [id]: !current[id] }));
  }

  return (
    <div className={cn("min-w-0 max-w-full border bg-card px-5 py-8 sm:px-10", className)}>
      <header className="mb-6 text-center">
        <p className="text-sm">{statement.companyName}</p>
        <h2 className="font-heading mt-1 text-lg font-medium tracking-[0.14em] uppercase">
          Profit and Loss
        </h2>
        {statement.jobName ? (
          <p className="mt-1 text-sm text-muted-foreground">{statement.jobName}</p>
        ) : null}
        <p className="mt-0.5 text-sm text-muted-foreground">{statement.periodLabel}</p>
      </header>

      <div className="mb-1 flex justify-end border-b pb-1">
        <span className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Total
        </span>
      </div>

      <div className="space-y-3">
        <SectionBlock
          section={statement.income}
          open={open.income}
          onToggle={() => toggle("income")}
        />
        <SectionBlock
          section={statement.costOfSales}
          open={open.cos}
          onToggle={() => toggle("cos")}
        />
        <div className="flex items-baseline justify-between gap-4 border-y py-2 text-sm font-semibold tracking-wide uppercase">
          <span>Gross Profit</span>
          <span className="tabular-nums">{pnlAmount(statement.grossProfit)}</span>
        </div>
        <SectionBlock
          section={statement.expenses}
          open={open.expenses}
          onToggle={() => toggle("expenses")}
        />
        <SectionBlock
          section={statement.otherExpenses}
          open={open.other}
          onToggle={() => toggle("other")}
        />
        <div className="flex items-baseline justify-between gap-4 border-t-2 border-foreground py-2 text-sm font-semibold tracking-wide uppercase">
          <span>Net Income</span>
          <span className="tabular-nums">{pnlAmount(statement.netIncome)}</span>
        </div>
      </div>
      <p className="mt-5 text-center text-[11px] text-muted-foreground">
        {statement.basis === "cash"
          ? "Cash basis — income is money received. Cost of sales and expenses are receipts on the books. Open a total to see each payment or bill."
          : "Accrual basis — income is invoiced work. Cost of sales and expenses are receipts on the books. Open a total to see each invoice or bill."}
      </p>
    </div>
  );
}
