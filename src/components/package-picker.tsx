"use client";

import {
  cheapestOptionKey,
  isGbbEstimate,
  listEstimateOptions,
  optionBlurb,
  optionHighlightLabels,
  recommendedOptionKey,
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

type PackagePickerLine = Pick<
  EstimateLine,
  "quantity" | "unitCost" | "optional" | "selected" | "taxable"
> &
  Partial<Pick<EstimateLine, "package" | "groupName" | "title" | "description">>;

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
  const recommended = recommendedOptionKey(options);
  const totalFor = (key: string) => totalsForPackage(estimate, lines, key).total;
  const baseline = cheapestOptionKey(options, totalFor);
  const baselineName = options.find((item) => item.key === baseline)?.name;
  const columns = options.length === 1 ? 1 : options.length === 2 ? 2 : 3;
  return (
    <div
      className={cn(
        "grid gap-3",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns >= 3 && "grid-cols-1 sm:grid-cols-3",
        className,
      )}
    >
      {options.map((option) => {
        const totals = totalsForPackage(estimate, lines, option.key);
        const active = option.key === selected;
        const highlights = optionHighlightLabels(lines, option.key);
        const delta = baseline && option.key !== baseline ? totals.total - totalFor(baseline) : 0;
        const popular = option.key === recommended;
        return (
          <button
            key={option.key}
            type="button"
            disabled={locked}
            onClick={() => onSelect?.(option.key)}
            className={cn(
              "rounded-md border px-4 py-3.5 text-left transition-colors",
              active
                ? "border-foreground bg-foreground text-background shadow-sm"
                : "bg-card hover:bg-muted/50",
              locked && "cursor-default",
            )}
            aria-pressed={active}
            aria-label={`${option.name}, ${formatMoney(totals.total)}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p
                className={cn(
                  "text-[11px] font-semibold tracking-[0.16em] uppercase",
                  active ? "text-background/70" : "text-muted-foreground",
                )}
              >
                {option.name}
              </p>
              {active ? (
                <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold tracking-wide text-foreground uppercase">
                  Your pick
                </span>
              ) : popular ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
                  Most chosen
                </span>
              ) : null}
            </div>
            <p className="font-heading mt-1.5 text-xl font-medium tabular-nums">{formatMoney(totals.total)}</p>
            {delta > 0 && baselineName ? (
              <p className={cn("mt-0.5 text-xs tabular-nums", active ? "text-background/70" : "text-muted-foreground")}>
                +{formatMoney(delta)} vs {baselineName}
              </p>
            ) : baseline && option.key === baseline && options.length > 1 ? (
              <p className={cn("mt-0.5 text-xs", active ? "text-background/70" : "text-muted-foreground")}>
                Starting price
              </p>
            ) : null}
            {highlights.length > 0 ? (
              <ul className={cn("mt-2 space-y-1 text-xs leading-relaxed", active ? "text-background/80" : "text-muted-foreground")}>
                {highlights.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            ) : (
              <p className={cn("mt-2 text-xs leading-relaxed", active ? "text-background/70" : "text-muted-foreground")}>
                {optionBlurb(option.key)}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
