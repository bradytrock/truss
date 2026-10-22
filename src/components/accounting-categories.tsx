"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { accCard, accRed } from "@/components/accounting-chrome";
import {
  chartAccountsOrDefaults,
  expenseCategoriesOrDefaults,
  expenseCategoryInUse,
  isBuiltinChartNumber,
  isBuiltinExpenseCategory,
} from "@/lib/expense-categories";
import { useCrm } from "@/lib/crm-store";
import { cn } from "@/lib/utils";
import {
  EXPENSE_CATEGORY_SECTION_LABELS,
  EXPENSE_CATEGORY_SECTIONS,
  type CompanyChartAccount,
  type ExpenseCategory,
  type ExpenseCategorySection,
} from "@/lib/types";

export function AccountingCategories() {
  const crm = useCrm();
  const categories = useMemo(
    () => expenseCategoriesOrDefaults(crm.expenseCategories),
    [crm.expenseCategories],
  );
  const charts = useMemo(
    () => chartAccountsOrDefaults(crm.chartAccounts, categories),
    [crm.chartAccounts, categories],
  );
  const [categoryId, setCategoryId] = useState<string | "new" | null>(null);
  const [chartId, setChartId] = useState<string | "new" | null>(null);
  const editing = categoryId && categoryId !== "new" ? categories.find((item) => item.id === categoryId) ?? null : null;
  const editingChart = chartId && chartId !== "new" ? charts.find((item) => item.id === chartId) ?? null : null;

  return (
    <div className="space-y-4">
      <section className={cn(accCard, "overflow-hidden")}>
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
          <div>
            <h2 className="text-base font-semibold">Expense categories</h2>
            <p className="mt-1 max-w-2xl text-sm text-[#6f6a64]">
              The names on a receipt each post to one account in your QuickBooks chart. Add a category when the work
              changes. Change the account when the chart changes. Expenses still in the queue pick up the new account
              the next time QuickBooks updates.
            </p>
          </div>
          <Button type="button" className={cn("rounded-full", accRed)} onClick={() => setCategoryId("new")}>
            Add category
          </Button>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-xs text-[#8a847c]">
            <tr>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">QuickBooks account</th>
              <th className="px-4 py-2 font-medium">Posts as</th>
              <th className="px-4 py-2 font-medium">Profit and loss</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id} className={cn("border-t border-[#f3efe9]", !category.active && "text-[#8a847c]")}>
                <td className="px-4 py-3 font-medium">
                  {category.label}
                  {category.active ? null : (
                    <span className="ml-2 rounded-full bg-[#f3f1ec] px-2 py-0.5 text-[11px] font-medium text-[#5c5854]">
                      Hidden
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {category.qbAccountNumber} · {category.qbAccountName}
                </td>
                <td className="px-4 py-3">{category.requiresJob ? "Job cost" : "Company overhead"}</td>
                <td className="px-4 py-3">{EXPENSE_CATEGORY_SECTION_LABELS[category.section]}</td>
                <td className="px-4 py-3 text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setCategoryId(category.id)}
                  >
                    Change
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className={cn(accCard, "overflow-hidden")}>
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
          <div>
            <h2 className="text-base font-semibold">Chart of accounts</h2>
            <p className="mt-1 max-w-2xl text-sm text-[#6f6a64]">
              These are the QuickBooks accounts a category can post to. Use the number and name exactly as they appear
              in the company file.
            </p>
          </div>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setChartId("new")}>
            Add account
          </Button>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="text-xs text-[#8a847c]">
            <tr>
              <th className="px-4 py-2 font-medium">Number</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Used by</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {charts.map((account) => {
              const used = categories
                .filter((item) => item.chartAccountId === account.id || item.qbAccountNumber === account.accountNumber)
                .map((item) => item.label);
              return (
                <tr key={account.id} className="border-t border-[#f3efe9]">
                  <td className="px-4 py-3 font-medium tabular-nums">{account.accountNumber}</td>
                  <td className="px-4 py-3">{account.name}</td>
                  <td className="px-4 py-3 text-[#6f6a64]">{used.length ? used.join(", ") : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => setChartId(account.id)}
                    >
                      Change
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </section>

      <CategoryDialog
        open={categoryId !== null}
        category={categoryId === "new" ? null : editing}
        charts={charts.filter((item) => item.active)}
        inUse={
          editing
            ? expenseCategoryInUse(editing.key, crm.expenses, crm.forecastedExpenses ?? [])
            : false
        }
        onOpenChange={(open) => {
          if (!open) setCategoryId(null);
        }}
        onAddAccount={() => setChartId("new")}
      />
      <ChartDialog
        open={chartId !== null}
        account={chartId === "new" ? null : editingChart}
        onOpenChange={(open) => {
          if (!open) setChartId(null);
        }}
      />
    </div>
  );
}

function CategoryDialog({
  open,
  category,
  charts,
  inUse,
  onOpenChange,
  onAddAccount,
}: {
  open: boolean;
  category: ExpenseCategory | null;
  charts: CompanyChartAccount[];
  inUse: boolean;
  onOpenChange: (open: boolean) => void;
  onAddAccount: () => void;
}) {
  const crm = useCrm();
  const [pending, setPending] = useState(false);
  const formKey = category?.id ?? "new";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{category ? "Change category" : "Add category"}</DialogTitle>
          <DialogDescription>
            This name shows when someone logs a receipt. QuickBooks gets the account you pick.
          </DialogDescription>
        </DialogHeader>
        <CategoryForm
          key={`${formKey}-${open ? "open" : "closed"}`}
          label={category?.label ?? ""}
          chartAccountId={category?.chartAccountId ?? charts[0]?.id ?? ""}
          section={category?.section ?? "cost_of_sales"}
          requiresJob={category?.requiresJob ?? true}
          active={category?.active ?? true}
          charts={charts}
          pending={pending}
          canRemove={Boolean(category) && !isBuiltinExpenseCategory(category?.key ?? "")}
          inUse={inUse}
          onAddAccount={onAddAccount}
          onCancel={() => onOpenChange(false)}
          onRemove={
            category
              ? async () => {
                  setPending(true);
                  try {
                    const ok = await crm.removeExpenseCategory(category.id);
                    if (ok) onOpenChange(false);
                  } finally {
                    setPending(false);
                  }
                }
              : undefined
          }
          onSubmit={async (draft) => {
            setPending(true);
            try {
              const saved = await crm.saveExpenseCategory({ ...draft, id: category?.id });
              if (saved) onOpenChange(false);
            } finally {
              setPending(false);
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({
  label: initialLabel,
  chartAccountId: initialChart,
  section: initialSection,
  requiresJob: initialRequiresJob,
  active: initialActive,
  charts,
  pending,
  canRemove,
  inUse,
  onAddAccount,
  onCancel,
  onRemove,
  onSubmit,
}: {
  label: string;
  chartAccountId: string;
  section: ExpenseCategorySection;
  requiresJob: boolean;
  active: boolean;
  charts: CompanyChartAccount[];
  pending: boolean;
  canRemove: boolean;
  inUse: boolean;
  onAddAccount: () => void;
  onCancel: () => void;
  onRemove?: () => Promise<void>;
  onSubmit: (draft: {
    label: string;
    chartAccountId: string;
    section: ExpenseCategorySection;
    requiresJob: boolean;
    active: boolean;
  }) => Promise<void>;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [chartAccountId, setChartAccountId] = useState(initialChart);
  const [section, setSection] = useState<ExpenseCategorySection>(initialSection);
  const [requiresJob, setRequiresJob] = useState(initialRequiresJob);
  const [active, setActive] = useState(initialActive);
  const knownCharts = useRef(charts.map((item) => item.id).join(","));

  useEffect(() => {
    const ids = charts.map((item) => item.id);
    const previous = knownCharts.current ? knownCharts.current.split(",") : [];
    knownCharts.current = ids.join(",");
    const added = ids.filter((id) => !previous.includes(id));
    if (added.length === 1) setChartAccountId(added[0]);
  }, [charts]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({ label, chartAccountId, section, requiresJob, active });
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor="category-name">Category name</Label>
        <Input id="category-name" value={label} onChange={(event) => setLabel(event.target.value)} required />
      </div>
      <div className="grid gap-1.5">
        <Label>QuickBooks account</Label>
        <Select
          value={chartAccountId}
          onValueChange={(value) => {
            if (value) setChartAccountId(String(value));
          }}
          items={charts.map((item) => ({
            value: item.id,
            label: `${item.accountNumber} · ${item.name}`,
          }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Pick an account" />
          </SelectTrigger>
          <SelectContent>
            {charts.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.accountNumber} · {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button type="button" className="w-fit text-sm font-medium text-[#c43832] hover:underline" onClick={onAddAccount}>
          Add a chart account
        </button>
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Where it posts</legend>
        <div className="flex flex-wrap gap-2">
          <Choice active={requiresJob} onClick={() => setRequiresJob(true)}>
            Job cost
          </Choice>
          <Choice active={!requiresJob} onClick={() => setRequiresJob(false)}>
            Company overhead
          </Choice>
        </div>
        <p className="text-xs text-[#8a847c]">
          Job costs need a job and post to Customer:Job. Company overhead can stay on the company.
        </p>
      </fieldset>
      <div className="grid gap-1.5">
        <Label>Profit and loss</Label>
        <Select
          value={section}
          onValueChange={(value) => {
            if (value === "cost_of_sales" || value === "operating" || value === "other") setSection(value);
          }}
          items={EXPENSE_CATEGORY_SECTIONS.map((item) => ({
            value: item,
            label: EXPENSE_CATEGORY_SECTION_LABELS[item],
          }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPENSE_CATEGORY_SECTIONS.map((item) => (
              <SelectItem key={item} value={item}>
                {EXPENSE_CATEGORY_SECTION_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
        Show when logging an expense
      </label>
      <DialogFooter className="sm:justify-between">
        {canRemove && onRemove ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (inUse) {
                toast.error("Receipts already use this category. Hide it so new expenses can't pick it.");
                return;
              }
              void onRemove();
            }}
          >
            Remove
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" className={cn(accRed)} disabled={pending}>
            {pending ? "Saving" : "Save"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm",
        active ? "border-[#1c1c1c] bg-[#1c1c1c] text-white" : "border-[#e6e1da] bg-white text-[#3c3a37]",
      )}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function ChartDialog({
  open,
  account,
  onOpenChange,
}: {
  open: boolean;
  account: CompanyChartAccount | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? "Change account" : "Add account"}</DialogTitle>
          <DialogDescription>Match the number and name in the QuickBooks chart of accounts.</DialogDescription>
        </DialogHeader>
        <ChartForm
          key={`${account?.id ?? "new"}-${open ? "open" : "closed"}`}
          account={account}
          onCancel={() => onOpenChange(false)}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ChartForm({
  account,
  onCancel,
  onDone,
}: {
  account: CompanyChartAccount | null;
  onCancel: () => void;
  onDone: () => void;
}) {
  const crm = useCrm();
  const [number, setNumber] = useState(account?.accountNumber ?? "");
  const [name, setName] = useState(account?.name ?? "");
  const [pending, setPending] = useState(false);
  const canRemove = Boolean(account) && !isBuiltinChartNumber(account?.accountNumber ?? "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const saved = await crm.saveChartAccount({
        id: account?.id,
        accountNumber: number,
        name,
      });
      if (saved) onDone();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor="chart-number">Account number</Label>
        <Input
          id="chart-number"
          value={number}
          onChange={(event) => setNumber(event.target.value)}
          inputMode="numeric"
          autoComplete="off"
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="chart-name">Account name</Label>
        <Input id="chart-name" value={name} onChange={(event) => setName(event.target.value)} required />
      </div>
      <DialogFooter className="sm:justify-between">
        {canRemove && account ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setPending(true);
              void crm.removeChartAccount(account.id).then((ok) => {
                setPending(false);
                if (ok) onDone();
              });
            }}
          >
            Remove
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" className={cn(accRed)} disabled={pending}>
            {pending ? "Saving" : "Save"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
