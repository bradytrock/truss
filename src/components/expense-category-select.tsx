"use client";

import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { categoryChoices, expenseCategoriesOrDefaults, expenseChartLabel } from "@/lib/expense-categories";
import { useCrm } from "@/lib/crm-store";

export function ExpenseCategorySelect({
  value,
  onValueChange,
  disabled,
  triggerClassName,
  overheadOnly,
  showChart,
}: {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  triggerClassName?: string;
  overheadOnly?: boolean;
  showChart?: boolean;
}) {
  const crm = useCrm();
  const categories = useMemo(
    () => expenseCategoriesOrDefaults(crm.expenseCategories),
    [crm.expenseCategories],
  );
  const choices = useMemo(
    () => categoryChoices(categories, { overheadOnly, current: value }),
    [categories, overheadOnly, value],
  );
  const items = choices.map((item) => ({
    value: item.key,
    label: showChart ? `${item.label} · ${expenseChartLabel(item.key, categories)}` : item.label,
  }));

  return (
    <Select
      value={value}
      disabled={disabled || choices.length === 0}
      onValueChange={(next) => {
        if (next) onValueChange(String(next));
      }}
      items={items}
    >
      <SelectTrigger className={triggerClassName ? `${triggerClassName} w-full` : "w-full"}>
        <SelectValue placeholder={choices.length === 0 ? "No category for this" : "Category"} />
      </SelectTrigger>
      <SelectContent>
        {choices.map((item) => (
          <SelectItem key={item.key} value={item.key}>
            {showChart ? `${item.label} · ${expenseChartLabel(item.key, categories)}` : item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ExpenseCategoryPostingHint({ account }: { account: string }) {
  const crm = useCrm();
  const categories = useMemo(
    () => expenseCategoriesOrDefaults(crm.expenseCategories),
    [crm.expenseCategories],
  );
  const match = categories.find((item) => item.key === account);
  if (!match) return null;
  return (
    <p className="mt-1.5 text-xs text-[#8a847c]">
      Posts to {expenseChartLabel(account, categories)}
      {match.requiresJob ? " on the job." : " as company overhead."}
    </p>
  );
}
