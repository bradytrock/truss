"use client";

import {
  isGbbEstimate,
  listEstimateOptions,
  optionBlurb,
  resolveSelectedPackage,
  type EstimateOption,
  type EstimatePackage,
} from "@/lib/estimate-packages";
import { totalsForPackage } from "@/lib/estimate-totals";
import { formatMoney } from "@/lib/format";
import type { Estimate, EstimateLine } from "@/lib/types";
import { cn } from "@/lib/utils";

type PackagePickerEstimate = Pick<
  Estimate,
  "taxRate" | "discountKind" | "discountValue" | "depositKind" | "depositValue"
> &
  Partial<Pick<Estimate, "packageMode" | "selectedPackage" | "subtotalOverride" | "marginPercent">>;

type PackagePickerLine = Pick<EstimateLine, "quantity" | "unitCost" | "optional" | "selected" | "taxable"> &
  Partial<Pick<EstimateLine, "package" | "groupName">>;

export function PackagePicker({
  estimate,
  lines,
  pending,
  locked,
  onSelect,
  className,
}: {
  estimate: PackagePickerEstimate;
  lines: PackagePickerLine[];
  pending?: EstimateOption[];
  locked?: boolean;
  onSelect?: (pkg: EstimatePackage) => void;
  className?: string;
}) {
  if (!isGbbEstimate(estimate)) return null;
  const options = listEstimateOptions(lines, pending);
  if (options.length === 0) return null;
  const selected = resolveSelectedPackage(estimate, lines, pending);
  const columns = options.length === 1 ? 1 : options.length === 2 ? 2 : 3;
  return (
    <div
      className={cn("grid gap-3", columns === 1 && "sm:grid-cols-1", columns === 2 && "sm:grid-cols-2", columns >= 3 && "sm:grid-cols-3", className)}
    >
      {options.map((option) => {
        const totals = totalsForPackage(estimate, lines, option.key);
        const active = option.key === selected;
        return (
          <button
            key={option.key}
            type="button"
            disabled={locked}
            onClick={() => onSelect?.(option.key)}
            className={cn(
              "rounded-md border bg-card px-4 py-3 text-left transition-colors",
              active ? "border-foreground ring-2 ring-foreground/15" : "hover:bg-muted/50",
              locked && "cursor-default",
            )}
            aria-pressed={active}
            aria-label={`${option.name}, ${formatMoney(totals.total)}`}
          >
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              {option.name}
              {active ? " · selected" : ""}
            </p>
            <p className="font-heading mt-1 text-xl font-medium tabular-nums">{formatMoney(totals.total)}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{optionBlurb(option.key)}</p>
          </button>
        );
      })}
    </div>
  );
}
