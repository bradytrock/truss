"use client";

import { CompanyLetterhead } from "@/components/company-letterhead";
import { ProjectManagerBlock } from "@/components/project-manager-block";
import { EstimateStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useCrmOptional } from "@/lib/crm-store";
import { documentProjectManager, letterheadCompanyForRecord, type ProjectManagerContact } from "@/lib/document-owner";
import { billingEstimate, workMarket } from "@/lib/market";
import {
  estimateTotals,
  groupEstimateLines,
  lineAmount,
  lineIncluded,
  toClientFacingProposal,
  totalsForPackage,
} from "@/lib/estimate-totals";
import {
  gbbPrintSections,
  isGbbEstimate,
  listEstimateOptions,
  resolveSelectedPackage,
  scopedEstimateLines,
  type EstimatePackage,
} from "@/lib/estimate-packages";
import { formatDate, formatMoney } from "@/lib/format";
import { formatJobSite } from "@/lib/leads";
import { isSignaturePng } from "@/lib/estimate-signature";
import { estimateSignatureLines } from "@/lib/estimate-signers";
import { coOwnerContact } from "@/lib/parties";
import { EstimatePhotoThumb } from "@/components/estimate-line-photos";
import { photosForEstimateLine } from "@/lib/estimate-line-photos";
import type { CompanySettings, Estimate, EstimateLine, JobMarket, JobPhoto } from "@/lib/types";
import { companyEstimateTermsFor } from "@/lib/contract-types";
import { estimateTermsValues, liveEstimateTerms } from "@/lib/document-terms";
import { DocumentNotesBlock } from "@/components/document-notes";
import { DocumentTermsFields } from "@/components/document-terms-fields";
import { FormattedLineText } from "@/components/formatted-line-text";
import { lineHeading, proposalLineSummary, shouldShowLineDescription } from "@/lib/line-format";
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
  const options = isGbbEstimate(estimate) ? listEstimateOptions(lines) : [];
  if (options.length > 0) {
    return (
      <dl className={cn("space-y-3 text-[15px]", className)}>
        {options.map((option) => (
          <div key={option.key} className="flex justify-between gap-4 border-t-2 border-foreground pt-3 font-medium first:border-t-0 first:pt-0">
            <dt>{option.name}</dt>
            <dd className="tabular-nums">{formatMoney(totalsForPackage(estimate, lines, option.key).total)}</dd>
          </div>
        ))}
        <p className="pt-1 text-xs font-normal text-muted-foreground">
          Check one option. That option’s price is the contract total.
        </p>
        {estimate.depositKind === "percent" && estimate.depositValue > 0 ? (
          <p className="text-xs text-muted-foreground">
            Deposit due is {estimate.depositValue}% of the option you check.
          </p>
        ) : totals.deposit > 0 ? (
          <div className="flex justify-between gap-4 text-muted-foreground">
            <dt>Deposit due</dt>
            <dd className="tabular-nums">{formatMoney(totals.deposit)}</dd>
          </div>
        ) : null}
      </dl>
    );
  }
  const showBreakdown = totals.discount > 0 || totals.tax > 0;
  return (
    <dl className={cn("space-y-3 text-[15px]", className)}>
      {showBreakdown ? (
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular-nums">{formatMoney(totals.subtotal)}</dd>
        </div>
      ) : null}
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
      <div className="flex justify-between gap-4 border-t-2 border-foreground pt-3 font-medium">
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
          {estimate.hideLinePrices
            ? `${totals.optionalCount} optional item${totals.optionalCount === 1 ? "" : "s"} not in this total.`
            : `${formatMoney(totals.optionalTotal)} in optional work is not in this total.`}
        </p>
      ) : null}
    </dl>
  );
}


function ProposalLineList({
  lines,
  estimate,
  selectable,
  onToggleOptional,
  photos,
}: {
  lines: EstimateLine[];
  estimate: Estimate;
  selectable?: boolean;
  onToggleOptional?: (line: EstimateLine, selected: boolean) => void;
  photos: JobPhoto[];
}) {
  return (
    <ul className="divide-y">
      {lines.map((line) => {
        const included = lineIncluded(line);
        return (
          <li
            key={line.id}
            className={cn(
              "flex items-start justify-between gap-4 py-3.5",
              !included && "opacity-70",
            )}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {line.optional && selectable && onToggleOptional ? (
                  <Checkbox
                    checked={line.selected}
                    onCheckedChange={(value) => onToggleOptional(line, Boolean(value))}
                    aria-label={`Include ${lineHeading(line)}`}
                  />
                ) : null}
                <p className="text-[15px] leading-6">{proposalLineSummary(line)}</p>
                {line.optional ? (
                  <Badge variant="secondary">{included ? "Selected" : "Optional"}</Badge>
                ) : null}
              </div>
              {shouldShowLineDescription(line) ? (
                <FormattedLineText
                  text={line.description}
                  className="mt-0.5 text-sm text-muted-foreground"
                />
              ) : null}
              <ProposalLinePhotos line={line} gallery={photos} />
            </div>
            {estimate.hideLinePrices ? null : (
              <p className={cn("shrink-0 text-[15px] tabular-nums leading-6", !included && "line-through")}>
                {formatMoney(lineAmount(line))}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ProposalDocument({
  estimate,
  lines,
  customer,
  company,
  market,
  photos,
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
  photos?: JobPhoto[];
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
  const billed = toClientFacingProposal(
    billingEstimate(
      estimate,
      market || (job || opportunity ? workMarket(job, opportunity) : undefined),
    ),
    lines,
  );
  const gbb = isGbbEstimate(estimate);
  const visibleLines = gbb ? billed.lines : scopedEstimateLines(billed.estimate, billed.lines);
  const groups = groupEstimateLines(visibleLines);
  const printSections = gbb
    ? gbbPrintSections(visibleLines)
    : groups.map((group) => ({
        kind: "shared" as const,
        key: "",
        name: groups.length > 1 ? group.name : "",
        lines: group.lines,
      }));
  const manager =
    projectManager ??
    documentProjectManager({
      job,
      opportunity,
      staff: crm?.staff ?? [],
      fallbackStaffId: crm?.user.staffId,
      companyPhone: letterhead.phone,
    });
  const terms = liveEstimateTerms({
    estimate,
    companyDefault: companyEstimateTermsFor(letterhead, estimate.contractTypeId),
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
      {gbb && printSections.some((section) => section.kind === "option") ? (
        <p className="text-sm text-muted-foreground">
          Check one option. Shared work is included in every option. Options replace each other; they do not stack.
        </p>
      ) : null}
      {visibleLines.length === 0 ? (
        <p className="text-sm text-muted-foreground">No line items on this proposal yet.</p>
      ) : (
        <div className="space-y-5">
          {printSections.map((section) => (
            <section key={section.key || section.name || "items"}>
              {section.kind === "option" ? (
                <label className="mb-2 flex items-center gap-2.5">
                  <Checkbox
                    checked={
                      selectable && onSelectPackage
                        ? resolveSelectedPackage(billed.estimate, billed.lines) === section.key
                        : false
                    }
                    disabled={!selectable || !onSelectPackage}
                    onCheckedChange={(value) => {
                      if (value) onSelectPackage?.(section.key);
                    }}
                    aria-label={`Choose ${section.name}`}
                  />
                  <h3 className="min-w-0 flex-1 text-[11px] font-semibold tracking-[0.16em] uppercase">
                    {section.name}
                  </h3>
                  <span className="text-[15px] font-medium tabular-nums">
                    {formatMoney(totalsForPackage(billed.estimate, billed.lines, section.key).total)}
                  </span>
                </label>
              ) : section.name ? (
                <h3 className="mb-2 text-[11px] font-semibold tracking-[0.16em] uppercase">
                  {section.name}
                </h3>
              ) : null}
              <ProposalLineList
                lines={section.lines}
                estimate={estimate}
                selectable={selectable}
                onToggleOptional={onToggleOptional}
                photos={photos ?? crm?.photos ?? []}
              />
            </section>
          ))}
        </div>
      )}
      <EstimateTotals estimate={billed.estimate} lines={visibleLines} />
      <DocumentNotesBlock notes={estimate.notes} />
      <div className="break-inside-auto">
        <h3 className="mb-1 text-[11px] font-semibold tracking-[0.16em] uppercase">Terms</h3>
        <DocumentTermsFields
          value={terms}
          values={estimateTermsValues({
            estimate: billed.estimate,
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
          <EstimatePhotoThumb
            src={photo.imageUrl}
            alt={photo.caption || line.title || "Line photo"}
            className="aspect-[4/3] w-full rounded-sm border object-cover"
          />
        </li>
      ))}
    </ul>
  );
}
