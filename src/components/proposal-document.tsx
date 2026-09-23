"use client";

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
import { lineHeading, shouldShowLineDescription } from "@/lib/line-format";
import {
  paperAuthorizationCopy,
  paperEstimateMeta,
  paperIssuedAt,
  paperQtyLabel,
  paperRescissionCopy,
  paperSiteTitle,
} from "@/lib/document-paper";
import {
  PaperCoverHeader,
  PaperFooter,
  PaperMetaRow,
  PaperPartyCards,
  PaperSectionLabel,
  PaperSheet,
  PaperSignCue,
  PaperSiteTitle,
  PaperTableHead,
  PaperTableRow,
  PaperTermsColumns,
  PaperTotals,
  paperManagerCard,
} from "@/components/document-paper-chrome";
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
      <div className={cn("space-y-3", className)}>
        <PaperTotals
          rows={options.map((option) => ({
            label: option.name,
            value: formatMoney(totalsForPackage(estimate, lines, option.key).total),
          }))}
          pill={{ label: "TOTAL", value: formatMoney(totals.total) }}
        />
        <p className="text-xs text-muted-foreground">
          Check one option. That option’s price is the contract total.
        </p>
        {estimate.depositKind === "percent" && estimate.depositValue > 0 ? (
          <p className="text-xs text-muted-foreground">
            Deposit due is {estimate.depositValue}% of the option you check.
          </p>
        ) : totals.deposit > 0 ? (
          <p className="text-xs text-muted-foreground">Deposit due {formatMoney(totals.deposit)}</p>
        ) : null}
      </div>
    );
  }
  const rows: Array<{ label: string; value: string }> = [];
  if (totals.discount > 0 || totals.tax > 0) {
    rows.push({ label: "Subtotal", value: formatMoney(totals.subtotal) });
  }
  if (totals.discount > 0) {
    rows.push({
      label: estimate.discountKind === "percent" ? `Discount (${estimate.discountValue}%)` : "Discount",
      value: `−${formatMoney(totals.discount)}`,
    });
  }
  if (totals.tax > 0) {
    rows.push({ label: `Tax (${estimate.taxRate}%)`, value: formatMoney(totals.tax) });
  }
  if (totals.deposit > 0) {
    rows.push({
      label: estimate.depositKind === "percent" ? `Deposit due (${estimate.depositValue}%)` : "Deposit due",
      value: formatMoney(totals.deposit),
    });
  }
  return (
    <div className={cn("space-y-3", className)}>
      <PaperTotals rows={rows} pill={{ label: "TOTAL", value: formatMoney(totals.total) }} />
      {totals.optionalCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {estimate.hideLinePrices
            ? `${totals.optionalCount} optional item${totals.optionalCount === 1 ? "" : "s"} not in this total.`
            : `${formatMoney(totals.optionalTotal)} in optional work is not in this total.`}
        </p>
      ) : null}
    </div>
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
    <div className="divide-y">
      {lines.map((line) => {
        const included = lineIncluded(line);
        return (
          <PaperTableRow
            key={line.id}
            muted={!included}
            hidePrices={estimate.hideLinePrices}
            heading={
              <div className="flex flex-wrap items-center gap-2">
                {line.optional && selectable && onToggleOptional ? (
                  <Checkbox
                    checked={line.selected}
                    onCheckedChange={(value) => onToggleOptional(line, Boolean(value))}
                    aria-label={`Include ${lineHeading(line)}`}
                  />
                ) : null}
                <p>{lineHeading(line)}</p>
                {line.optional ? (
                  <Badge variant="secondary">{included ? "Selected" : "Optional"}</Badge>
                ) : null}
              </div>
            }
            detail={
              shouldShowLineDescription(line) ? (
                <FormattedLineText text={line.description} className="mt-0.5 text-sm text-muted-foreground" />
              ) : null
            }
            extra={<ProposalLinePhotos line={line} gallery={photos} />}
            qty={paperQtyLabel(line.quantity)}
            unit={line.unit || ""}
            rate={formatMoney(line.unitCost)}
            amount={formatMoney(lineAmount(line))}
          />
        );
      })}
    </div>
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
  const site = paperSiteTitle({
    street: estimate.street,
    city: estimate.city,
    state: estimate.state,
    postalCode: estimate.postalCode,
    name: estimate.name,
    kindTitle: "Estimate",
  });
  return (
    <PaperSheet className="space-y-6 p-5 sm:p-7">
      <PaperCoverHeader company={letterhead} kind="estimate" number={estimate.number} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PaperSiteTitle title={site.title} locality={site.locality} />
        {showStatus ? <EstimateStatusBadge status={estimate.status} /> : null}
      </div>
      <PaperMetaRow
        items={paperEstimateMeta({
          number: estimate.number,
          issuedAt: paperIssuedAt(estimate),
          validUntil: estimate.validUntil,
          jobCode: job?.code,
        })}
      />
      <PaperPartyCards
        left={{
          label: "Prepared for",
          name: customer,
          lines: [formatJobSite(estimate)].filter(Boolean),
        }}
        right={paperManagerCard(manager)}
      />
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
        <div className="space-y-5 overflow-x-auto">
          <PaperTableHead hidePrices={estimate.hideLinePrices} />
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
      <PaperSignCue pageLabel="the authorization page" />
      <DocumentNotesBlock notes={estimate.notes} />
      <div className="break-inside-auto space-y-2">
        <PaperSectionLabel>Terms</PaperSectionLabel>
        <PaperTermsColumns>
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
        </PaperTermsColumns>
      </div>
      <ProposalSignature
        estimate={estimate}
        companyName={letterhead.name}
        total={formatMoney(estimateTotals(billed.estimate, visibleLines).total)}
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
        manager={manager}
      />
      <PaperFooter company={letterhead} />
    </PaperSheet>
  );
}

export function ProposalSignature({
  estimate,
  contractorName,
  primaryName,
  secondName,
  companyName,
  total,
  manager,
}: {
  estimate: Estimate;
  contractorName?: string;
  primaryName?: string;
  secondName?: string | null;
  companyName?: string;
  total?: string;
  manager?: ProjectManagerContact | null;
}) {
  const lines = estimateSignatureLines(estimate, {
    contractor: contractorName,
    primary: primaryName || "Homeowner",
    second: secondName,
  });
  const homeowners = lines.filter((line) => line.party === "homeowner");
  const contractor = lines.find((line) => line.party === "contractor");
  return (
    <div className="space-y-4">
      <PaperSectionLabel>Authorization</PaperSectionLabel>
      {total ? (
        <div className="rounded-md bg-[#f5f5f5] px-3.5 py-3">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-[#6e6e6e] uppercase">Contract total</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{total}</p>
        </div>
      ) : null}
      <p className="text-sm leading-relaxed">{paperAuthorizationCopy(companyName || "the contractor")}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{paperRescissionCopy()}</p>
      <div className="grid gap-6">
        {homeowners.map((line) => (
          <SignatureLineCell key={line.role} line={line} />
        ))}
      </div>
      <div>
        <p className="text-[10px] font-semibold tracking-[0.14em] text-[#6e6e6e] uppercase">Project manager</p>
        <p className="mt-1 text-sm font-semibold">{manager?.name || contractor?.name || contractorName}</p>
        {manager?.title ? <p className="text-xs text-muted-foreground">{manager.title}</p> : null}
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
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-4">
          <div className="h-16 border-b" />
          <div className="h-16 border-b" />
        </div>
      )}
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_6rem] gap-4 text-xs text-muted-foreground">
        <p>
          {line.party === "contractor" ? "Contractor" : "Homeowner signature"}
          {signed ? ` · ${formatDate(line.signedAt)}` : ""}
        </p>
        <p>Date</p>
      </div>
      <p className="mt-3 border-t pt-2 text-sm">{line.name}</p>
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
