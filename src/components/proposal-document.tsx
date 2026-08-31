"use client";

import { CompanyLetterhead } from "@/components/company-letterhead";
import { ProjectManagerBlock } from "@/components/project-manager-block";
import { EstimateStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useCrmOptional } from "@/lib/crm-store";
import { documentProjectManager, letterheadCompanyForRecord, type ProjectManagerContact } from "@/lib/document-owner";
import { PackagePicker } from "@/components/package-picker";
import { billingEstimate, workMarket } from "@/lib/market";
import {
  estimateTotals,
  groupEstimateLines,
  lineAmount,
  lineIncluded,
} from "@/lib/estimate-totals";
import { isGbbEstimate, scopedEstimateLines, type EstimatePackage } from "@/lib/estimate-packages";
import { formatDate, formatMoney } from "@/lib/format";
import { formatJobSite } from "@/lib/leads";
import { isSignaturePng } from "@/lib/estimate-signature";
import { estimateSignatureLines } from "@/lib/estimate-signers";
import { coOwnerContact } from "@/lib/parties";
import { photosForEstimateLine } from "@/lib/estimate-line-photos";
import type { CompanySettings, Estimate, EstimateLine, JobMarket, JobPhoto } from "@/lib/types";
import { estimateTermsValues, resolveEstimateTerms } from "@/lib/document-terms";
import { DocumentNotesBlock } from "@/components/document-notes";
import { DocumentTermsFields } from "@/components/document-terms-fields";
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
  showStatus = true,
  projectManager,
  primaryCustomer,
  secondCustomer,
  contractorName,
  onTermsChange,
  onSelectPackage,
}: {
  estimate: Estimate;
  lines: EstimateLine[];
  customer: string;
  company?: CompanySettings;
  market?: JobMarket | "" | null;
  onToggleOptional?: (line: EstimateLine, selected: boolean) => void;
  selectable?: boolean;
  showStatus?: boolean;
  projectManager?: ProjectManagerContact | null;
  primaryCustomer?: string;
  secondCustomer?: string | null;
  contractorName?: string;
  onTermsChange?: (terms: string) => void;
  onSelectPackage?: (pkg: EstimatePackage) => void;
}) {
  const visibleLines = scopedEstimateLines(estimate, lines);
  const groups = groupEstimateLines(visibleLines);
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
  const manager =
    projectManager ??
    documentProjectManager({
      job,
      opportunity,
      staff: crm?.staff ?? [],
      fallbackStaffId: crm?.user.staffId,
      companyPhone: letterhead.phone,
    });
  const terms = resolveEstimateTerms({
    explicit: estimate.terms,
    companyDefault: letterhead.defaultEstimateTerms,
  });
  return (
    <div className="space-y-6 rounded-md border bg-card p-5 sm:p-7">
      <CompanyLetterhead company={letterhead} showContact={false} />
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
      <ProjectManagerBlock manager={manager} />
      {estimate.intro ? (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{estimate.intro}</p>
      ) : null}
      {isGbbEstimate(estimate) ? (
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold tracking-[0.16em] uppercase">Choose a package</h3>
          <PackagePicker
            estimate={estimate}
            lines={lines}
            locked={!selectable || !onSelectPackage}
            onSelect={onSelectPackage}
          />
          <p className="text-xs text-muted-foreground">
            Pick one package. The items below are that package plus shared work. Packages do not stack.
          </p>
        </div>
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
                        <ProposalLinePhotos line={line} gallery={crm?.photos ?? []} />
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
      <EstimateTotals estimate={billed} lines={visibleLines} className="ml-auto max-w-xs" />
      <DocumentNotesBlock notes={estimate.notes} />
      <div className="break-inside-auto">
        <h3 className="mb-1 text-[11px] font-semibold tracking-[0.16em] uppercase">Terms</h3>
        <DocumentTermsFields
          value={terms}
          values={estimateTermsValues({
            estimate: billed,
            lines: visibleLines,
            customer,
            company: letterhead,
          })}
          disabled={!onTermsChange}
          emptyLabel="No terms on this proposal."
          hint=""
          onCommit={onTermsChange ?? (() => {})}
        />
      </div>
      <ProposalSignature
        estimate={estimate}
        contractorName={contractorName || manager?.name || letterhead.name}
        primaryName={
          primaryCustomer ||
          crm?.getContact(estimate.contactId)?.name ||
          customer
        }
        secondName={
          secondCustomer ??
          (estimate.secondContactId ? crm?.getContact(estimate.secondContactId)?.name : null) ??
          (estimate.status === "accepted" || estimate.status === "declined"
            ? null
            : coOwnerContact(job, crm?.contacts ?? [], estimate.contactId)?.name) ??
          null
        }
      />
    </div>
  );
}

export function ProposalSignature({
  estimate,
  contractorName,
  primaryName,
  secondName,
}: {
  estimate: Estimate;
  contractorName?: string;
  primaryName?: string;
  secondName?: string | null;
}) {
  const lines = estimateSignatureLines(estimate, {
    contractor: contractorName,
    primary: primaryName || "Homeowner",
    second: secondName,
  });
  const contractor = lines.find((line) => line.party === "contractor");
  const homeowners = lines.filter((line) => line.party === "homeowner");
  return (
    <div>
      <h3 className="mb-1 text-[11px] font-semibold tracking-[0.16em] uppercase">Authorization</h3>
      <div className="mt-3 grid gap-6 sm:grid-cols-2 sm:items-start">
        {contractor ? <SignatureLineCell key={contractor.role} line={contractor} /> : null}
        <div className="grid gap-6">
          {homeowners.map((line) => (
            <SignatureLineCell key={line.role} line={line} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SignatureLineCell({
  line,
}: {
  line: ReturnType<typeof estimateSignatureLines>[number];
}) {
  const signed = Boolean(line.signedAt);
  const drawn = isSignaturePng(line.image);
  return (
    <div>
      {drawn ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={line.image}
          alt={`Signature of ${line.name}`}
          className="h-16 w-full max-w-xs object-contain object-left"
        />
      ) : signed && line.party === "contractor" ? (
        <p className="flex h-16 items-end font-serif text-2xl italic leading-none">{line.name}</p>
      ) : (
        <div className="h-16 border-b" />
      )}
      <p className="mt-2 border-t pt-2 text-sm">{line.name}</p>
      <p className="text-xs text-muted-foreground">
        {line.party === "contractor" ? "Contractor" : "Homeowner signature"}
        {signed ? ` · ${formatDate(line.signedAt)}` : ""}
      </p>
    </div>
  );
}

function ProposalLinePhotos({
  line,
  gallery,
}: {
  line: EstimateLine;
  gallery: JobPhoto[];
}) {
  const photos = photosForEstimateLine(line, gallery);
  if (!photos.length) return null;
  return (
    <ul className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
      {photos.map((photo) => (
        <li key={photo.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.imageUrl}
            alt={photo.caption || line.title || "Line photo"}
            className="aspect-[4/3] w-full rounded-sm border object-cover"
          />
        </li>
      ))}
    </ul>
  );
}
