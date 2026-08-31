"use client";

import {
  ESTIMATE_PACKAGES,
  PACKAGE_BLURB,
  PACKAGE_LABEL,
  isGbbEstimate,
  parseEstimatePackage,
  type EstimatePackage,
} from "@/lib/estimate-packages";
import { totalsForPackage } from "@/lib/estimate-totals";
import { formatMoney } from "@/lib/format";
import type { Estimate, EstimateLine } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PackagePicker({
  estimate,
  lines,
  locked,
  onSelect,
  className,
}: {
  estimate: Estimate;
  lines: EstimateLine[];
  locked?: boolean;
  onSelect?: (pkg: EstimatePackage) => void;
  className?: string;
}) {
  if (!isGbbEstimate(estimate)) return null;
  const selected = parseEstimatePackage(estimate.selectedPackage);
  return (
    <div className={cn("grid gap-3 sm:grid-cols-3", className)}>
      {ESTIMATE_PACKAGES.map((pkg) => {
        const totals = totalsForPackage(estimate, lines, pkg);
        const active = pkg === selected;
        return (
          <button
            key={pkg}
            type="button"
            disabled={locked}
            onClick={() => onSelect?.(pkg)}
            className={cn(
              "rounded-md border bg-card px-4 py-3 text-left transition-colors",
              active ? "border-foreground ring-2 ring-foreground/15" : "hover:bg-muted/50",
              locked && "cursor-default",
            )}
            aria-pressed={active}
            aria-label={`${PACKAGE_LABEL[pkg]} package, ${formatMoney(totals.total)}`}
          >
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              {PACKAGE_LABEL[pkg]}
              {active ? " · selected" : ""}
            </p>
            <p className="font-heading mt-1 text-xl font-medium tabular-nums">{formatMoney(totals.total)}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{PACKAGE_BLURB[pkg]}</p>
          </button>
        );
      })}
    </div>
  );
}
