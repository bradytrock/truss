"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { JobPnlComparison, PnlSection, ProfitAndLossStatement } from "@/lib/profit-and-loss";
import { cn } from "@/lib/utils";

function pnlAmount(value: number) {
  const text = formatMoney(Math.abs(value));
  return value < 0 ? `(${text})` : text;
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
          <ul>
            {lines.map((line) => (
              <li key={line.id} className="flex items-baseline justify-between gap-4 py-0.5 pl-8 text-sm">
                {line.href ? (
                  <Link href={line.href} className="min-w-0 truncate hover:underline">
                    {line.label}
                  </Link>
                ) : (
                  <span className="min-w-0 truncate">{line.label}</span>
                )}
                <span className="shrink-0 tabular-nums text-muted-foreground">{pnlAmount(line.amount)}</span>
              </li>
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

export function JobPnlComparisonTable({
  statement,
  comparison,
}: {
  statement: ProfitAndLossStatement;
  comparison: JobPnlComparison;
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
            {projectedMargin == null ? "Margin —" : `${(projectedMargin * 100).toFixed(1)}% margin`}
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
    <div className={cn("border bg-card px-5 py-8 sm:px-10", className)}>
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
          ? "Cash basis — income is money received. Cost of sales and expenses are receipts on the books."
          : "Accrual basis — income is invoiced work. Cost of sales and expenses are receipts on the books."}
      </p>
    </div>
  );
}
