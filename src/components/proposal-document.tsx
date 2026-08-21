"use client";

import { CompanyLetterhead } from "@/components/company-letterhead";
import { EstimateStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useCrmOptional } from "@/lib/crm-store";
import { letterheadCompanyForRecord } from "@/lib/document-owner";
import { billingEstimate, workMarket } from "@/lib/market";
import {
  estimateTotals,
  groupEstimateLines,
  lineAmount,
  lineIncluded,
} from "@/lib/estimate-totals";
import { formatDate, formatMoney } from "@/lib/format";
import { formatJobSite } from "@/lib/leads";
import type { CompanySettings, Estimate, EstimateLine, JobMarket } from "@/lib/types";
import { cn } from "@/lib/utils";

export function EstimateTotals({
  estimate,
  lines,
  className,
}: {
  estimate: Estimate;
  lines: EstimateLine[];
  className?: string;
}) {
  const totals = estimateTotals(estimate, lines);
  return (
    <dl className={cn("space-y-1.5 text-sm", className)}>
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="tabular-nums">{formatMoney(totals.subtotal)}</dd>
      </div>
      {totals.discount > 0 ? (
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">
            Discount
            {estimate.discountKind === "percent" ? ` (${estimate.discountValue}%)` : ""}
          </dt>
          <dd className="tabular-nums">−{formatMoney(totals.discount)}</dd>
        </div>
      ) : null}
      {totals.tax > 0 ? (
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Tax ({estimate.taxRate}%)</dt>
          <dd className="tabular-nums">{formatMoney(totals.tax)}</dd>
        </div>
      ) : null}
      <div className="flex justify-between gap-4 border-t pt-2 font-medium">
        <dt>Total</dt>
        <dd className="tabular-nums">{formatMoney(totals.total)}</dd>
      </div>
      {totals.deposit > 0 ? (
        <div className="flex justify-between gap-4 text-muted-foreground">
          <dt>
            Deposit due
            {estimate.depositKind === "percent" ? ` (${estimate.depositValue}%)` : ""}
          </dt>
          <dd className="tabular-nums">{formatMoney(totals.deposit)}</dd>
        </div>
      ) : null}
      {totals.optionalCount > 0 ? (
        <p className="pt-1 text-xs text-muted-foreground">
          {formatMoney(totals.optionalTotal)} in optional work is not in this total.
        </p>
      ) : null}
    </dl>
  );
}

export function ProposalDocument({
  estimate,
  lines,
  customer,
  company,
  market,
  onToggleOptional,
  selectable,
  showInternalNotes = false,
  showStatus = true,
}: {
  estimate: Estimate;
  lines: EstimateLine[];
  customer: string;
  company?: CompanySettings;
  market?: JobMarket | "" | null;
  onToggleOptional?: (line: EstimateLine, selected: boolean) => void;
  selectable?: boolean;
  showInternalNotes?: boolean;
  showStatus?: boolean;
}) {
  const groups = groupEstimateLines(lines);
  const site = formatJobSite(estimate);
  const crm = useCrmOptional();
  const job = estimate.jobId && crm ? crm.jobs.find((item) => item.id === estimate.jobId) : undefined;
  const opportunity =
    estimate.opportunityId && crm
      ? crm.opportunities.find((item) => item.id === estimate.opportunityId)
      : undefined;
  const letterhead = letterheadCompanyForRecord({
    company: company ?? crm?.company,
    job,
    opportunity,
    staff: crm?.staff ?? [],
    fallbackStaffId: crm?.user.staffId,
    inBook: Boolean(crm?.estimates.some((item) => item.id === estimate.id)),
  });
  const billed = billingEstimate(
    estimate,
    market || (job || opportunity ? workMarket(job, opportunity) : undefined),
  );
  return (
    <div className="space-y-6 rounded-md border bg-card p-5 sm:p-7">
      <CompanyLetterhead company={letterhead} />
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {estimate.number}
          </p>
          <h2 className="font-heading mt-1 text-2xl font-medium text-balance">
            {site || estimate.name}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">Prepared for {customer}</p>
          {site && site !== estimate.name ? (
            <p className="text-sm text-muted-foreground">{site}</p>
          ) : null}
        </div>
        <div className="text-sm sm:text-right">
          {showStatus ? <EstimateStatusBadge status={estimate.status} /> : null}
          <p className={showStatus ? "mt-2 text-muted-foreground" : "text-muted-foreground"}>
            Valid until {formatDate(estimate.validUntil)}
          </p>
        </div>
      </div>
      {estimate.intro ? (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{estimate.intro}</p>
      ) : null}
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No line items on this proposal yet.</p>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.name}>
              <h3 className="mb-2 text-[11px] font-semibold tracking-[0.16em] uppercase">
                {group.name}
              </h3>
              <ul className="divide-y border-y">
                {group.lines.map((line) => {
                  const included = lineIncluded(line);
                  return (
                    <li
                      key={line.id}
                      className={cn(
                        "flex items-start justify-between gap-3 py-3",
                        !included && "opacity-70"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {line.optional && selectable && onToggleOptional ? (
                            <Checkbox
                              checked={line.selected}
                              onCheckedChange={(value) => onToggleOptional(line, Boolean(value))}
                              aria-label={`Include ${line.title || line.description}`}
                            />
                          ) : null}
                          <p className="font-medium">{line.title || line.description}</p>
                          {line.optional ? (
                            <Badge variant="secondary">{included ? "Selected" : "Optional"}</Badge>
                          ) : null}
                        </div>
                        {line.description && line.description !== line.title ? (
                          <p className="mt-0.5 text-sm text-muted-foreground">{line.description}</p>
                        ) : null}
                        <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                          {line.quantity} {line.unit} × {formatMoney(line.unitCost)}
                        </p>
                      </div>
                      <p className={cn("shrink-0 tabular-nums", !included && "line-through")}>
                        {formatMoney(lineAmount(line))}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      <EstimateTotals estimate={billed} lines={lines} className="ml-auto max-w-xs" />
      {estimate.terms ? (
        <div>
          <h3 className="mb-1 text-[11px] font-semibold tracking-[0.16em] uppercase">Terms</h3>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {estimate.terms}
          </p>
        </div>
      ) : null}
      {showInternalNotes && estimate.notes ? (
        <div>
          <h3 className="mb-1 text-[11px] font-semibold tracking-[0.16em] uppercase">
            Internal notes
          </h3>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {estimate.notes}
          </p>
        </div>
      ) : null}
    </div>
  );
}
