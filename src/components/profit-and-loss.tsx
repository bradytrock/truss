"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { PnlSection, ProfitAndLossStatement } from "@/lib/profit-and-loss";
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
